import { describe, expect, it } from "vitest";
import type { OpenDalOperatorLike, OpenDalWriteOptions } from "./opendal";
import { createOpenDalBlobStorage } from "./opendal";

interface StoredObject {
	data: Uint8Array;
	contentType?: string;
	lastModified: number;
}

function createFakeOpenDalOperator(): {
	operator: OpenDalOperatorLike;
	objects: Map<string, StoredObject>;
} {
	const objects = new Map<string, StoredObject>();
	const operator: OpenDalOperatorLike = {
		async write(
			path: string,
			data: Uint8Array | string,
			options?: OpenDalWriteOptions,
		) {
			const bytes =
				typeof data === "string" ? new TextEncoder().encode(data) : data;
			objects.set(path, {
				data: new Uint8Array(bytes),
				contentType: options?.contentType,
				lastModified: 1_700_000_000_000,
			});
		},
		async read(path: string) {
			const object = objects.get(path);
			if (!object) throw notFound(path);
			return new Uint8Array(object.data);
		},
		async stat(path: string) {
			const object = objects.get(path);
			if (!object) throw notFound(path);
			return {
				contentLength: BigInt(object.data.byteLength),
				contentType: object.contentType,
				etag: `"${path}"`,
				lastModified: new Date(object.lastModified),
			};
		},
		async delete(path: string) {
			objects.delete(path);
		},
		async exists(path: string) {
			return objects.has(path);
		},
		async presignRead(path: string, expiresSeconds: number) {
			return {
				url: `https://cdn.example/${path}?expires=${expiresSeconds}`,
			};
		},
	};
	return { operator, objects };
}

function notFound(path: string): Error {
	return new Error(`NotFound: ${path}`);
}

describe("createOpenDalBlobStorage", () => {
	it("writes and reads blobs through a prefixed OpenDAL operator", async () => {
		const { operator, objects } = createFakeOpenDalOperator();
		const storage = createOpenDalBlobStorage(operator, {
			prefix: "attachments",
		});
		const data = new Uint8Array([1, 2, 3]);

		await storage.write("room-1/image.png", data, {
			contentType: "image/png",
		});

		expect(objects.has("attachments/room-1/image.png")).toBe(true);
		expect(await storage.read("room-1/image.png")).toEqual(data);
		expect(await storage.stat("room-1/image.png")).toEqual({
			size: 3,
			contentType: "image/png",
			etag: '"attachments/room-1/image.png"',
			lastModified: 1_700_000_000_000,
		});
	});

	it("returns null for missing read and stat calls", async () => {
		const { operator } = createFakeOpenDalOperator();
		const storage = createOpenDalBlobStorage(operator);

		expect(await storage.read("missing.txt")).toBeNull();
		expect(await storage.stat("missing.txt")).toBeNull();
		await expect(storage.delete("missing.txt")).resolves.toBeUndefined();
	});

	it("creates presigned read URLs when OpenDAL supports them", async () => {
		const { operator } = createFakeOpenDalOperator();
		const storage = createOpenDalBlobStorage(operator, { prefix: "media/" });

		await expect(storage.presignRead?.("room-1/video.mp4", 120)).resolves.toBe(
			"https://cdn.example/media/room-1/video.mp4?expires=120",
		);
	});

	it("rejects unsafe keys and prefixes", async () => {
		const { operator } = createFakeOpenDalOperator();
		const storage = createOpenDalBlobStorage(operator);

		await expect(storage.read("../secret.txt")).rejects.toThrow(
			"cannot contain",
		);
		expect(() =>
			createOpenDalBlobStorage(operator, { prefix: "/absolute" }),
		).toThrow("relative");
	});
});
