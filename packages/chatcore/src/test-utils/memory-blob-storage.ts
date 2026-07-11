import type {
	ChatCoreBlobMetadata,
	ChatCoreBlobStorage,
	ChatCoreBlobWriteOptions,
} from "../blob-storage";

export interface MemoryBlobRecord {
	data: Uint8Array;
	metadata: ChatCoreBlobMetadata;
}

/** Create an in-memory blob storage backend for tests and local development. */
export function createMemoryBlobStorage(): {
	storage: ChatCoreBlobStorage;
	blobs: Map<string, MemoryBlobRecord>;
} {
	const blobs = new Map<string, MemoryBlobRecord>();

	const storage: ChatCoreBlobStorage = {
		async write(
			key: string,
			data: Uint8Array,
			options?: ChatCoreBlobWriteOptions,
		) {
			blobs.set(key, {
				data: new Uint8Array(data),
				metadata: {
					size: data.byteLength,
					contentType: options?.contentType,
					lastModified: Date.now(),
				},
			});
		},
		async read(key: string) {
			const record = blobs.get(key);
			return record ? new Uint8Array(record.data) : null;
		},
		async stat(key: string) {
			const record = blobs.get(key);
			return record ? { ...record.metadata } : null;
		},
		async delete(key: string) {
			blobs.delete(key);
		},
		async presignRead(key: string, expiresSeconds: number) {
			return `memory://${encodeURIComponent(key)}?expires=${expiresSeconds}`;
		},
	};

	return { storage, blobs };
}
