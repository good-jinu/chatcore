import type {
	ChatCoreBlobMetadata,
	ChatCoreBlobStorage,
	ChatCoreBlobWriteOptions,
} from "./blob-storage";

export interface OpenDalWriteOptions {
	contentType?: string;
}

export interface OpenDalMetadataLike {
	contentLength?: number | bigint;
	contentType?: string | null;
	etag?: string | null;
	lastModified?: Date | number | string | null;
}

export interface OpenDalPresignedRequestLike {
	url?: string;
	uri?: string;
	href?: string;
}

export interface OpenDalOperatorLike {
	read(path: string): Promise<Uint8Array>;
	write(
		path: string,
		data: Uint8Array | string,
		options?: OpenDalWriteOptions,
	): Promise<unknown>;
	stat(path: string): Promise<OpenDalMetadataLike>;
	delete(path: string): Promise<unknown>;
	exists?(path: string): Promise<boolean>;
	presignRead?(
		path: string,
		expiresSeconds: number,
	): Promise<string | OpenDalPresignedRequestLike>;
}

export interface CreateOpenDalBlobStorageOptions {
	/**
	 * Optional key prefix under the OpenDAL operator root. For example,
	 * `attachments` stores ChatCore key `room-1/image.png` at
	 * `attachments/room-1/image.png`.
	 */
	prefix?: string;
}

/** Adapt an OpenDAL `Operator` to ChatCore's optional blob storage interface. */
export function createOpenDalBlobStorage(
	operator: OpenDalOperatorLike,
	options: CreateOpenDalBlobStorageOptions = {},
): ChatCoreBlobStorage {
	const prefix = normalizePrefix(options.prefix);
	const storage: ChatCoreBlobStorage = {
		async write(
			key: string,
			data: Uint8Array,
			writeOptions?: ChatCoreBlobWriteOptions,
		) {
			await operator.write(toOpenDalPath(prefix, key), data, {
				contentType: writeOptions?.contentType,
			});
		},
		async read(key: string) {
			const path = toOpenDalPath(prefix, key);
			try {
				if (operator.exists && !(await operator.exists(path))) return null;
				return await operator.read(path);
			} catch (error) {
				if (isNotFoundError(error)) return null;
				throw error;
			}
		},
		async stat(key: string) {
			try {
				return toBlobMetadata(await operator.stat(toOpenDalPath(prefix, key)));
			} catch (error) {
				if (isNotFoundError(error)) return null;
				throw error;
			}
		},
		async delete(key: string) {
			try {
				await operator.delete(toOpenDalPath(prefix, key));
			} catch (error) {
				if (!isNotFoundError(error)) throw error;
			}
		},
	};

	const presignRead = operator.presignRead;
	if (presignRead) {
		storage.presignRead = async (key: string, expiresSeconds: number) => {
			const request = await presignRead.call(
				operator,
				toOpenDalPath(prefix, key),
				expiresSeconds,
			);
			return toPresignedUrl(request);
		};
	}

	return storage;
}

function toOpenDalPath(prefix: string, key: string): string {
	validateRelativePath(key, "blob key");
	return prefix ? `${prefix}/${key}` : key;
}

function normalizePrefix(prefix?: string): string {
	if (prefix === undefined || prefix.length === 0) return "";
	if (prefix.startsWith("/") || prefix.includes("\\")) {
		throw new Error(
			"OpenDAL blob prefix must be a relative forward-slash path",
		);
	}

	let end = prefix.length;
	while (end > 0 && prefix[end - 1] === "/") end--;
	const normalized = prefix.slice(0, end);
	if (normalized.length === 0) return "";
	validateRelativePath(normalized, "OpenDAL blob prefix");
	return normalized;
}

function validateRelativePath(path: string, label: string): void {
	if (path.length === 0) throw new Error(`${label} is required`);
	if (path.startsWith("/") || path.includes("\\")) {
		throw new Error(`${label} must be a relative forward-slash path`);
	}
	const segments = path.split("/");
	if (
		segments.some(
			(segment) => segment.length === 0 || segment === "." || segment === "..",
		)
	) {
		throw new Error(`${label} cannot contain empty, '.', or '..' segments`);
	}
}

function toBlobMetadata(metadata: OpenDalMetadataLike): ChatCoreBlobMetadata {
	return {
		size: toContentLength(metadata.contentLength),
		contentType: metadata.contentType ?? undefined,
		etag: metadata.etag ?? undefined,
		lastModified: toEpochMilliseconds(metadata.lastModified),
	};
}

function toContentLength(value: number | bigint | undefined): number {
	if (typeof value === "bigint") {
		if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
			throw new Error("OpenDAL contentLength exceeds Number.MAX_SAFE_INTEGER");
		}
		return Number(value);
	}
	if (typeof value === "number" && Number.isFinite(value)) return value;
	throw new Error("OpenDAL metadata contentLength is missing");
}

function toEpochMilliseconds(
	value: Date | number | string | null | undefined,
): number | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value === "number")
		return Number.isFinite(value) ? value : undefined;
	if (typeof value === "string") {
		const parsed = Date.parse(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	const time = value.getTime();
	return Number.isFinite(time) ? time : undefined;
}

function toPresignedUrl(request: string | OpenDalPresignedRequestLike): string {
	if (typeof request === "string") return request;
	const url = request.url ?? request.uri ?? request.href;
	if (typeof url === "string") return url;
	throw new Error("OpenDAL presignRead did not return a URL");
}

function isNotFoundError(error: unknown): boolean {
	return error instanceof Error && error.message.includes("NotFound");
}
