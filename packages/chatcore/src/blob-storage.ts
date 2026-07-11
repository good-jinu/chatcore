/** Options for writing a blob through {@link ChatCoreBlobStorage}. */
export interface ChatCoreBlobWriteOptions {
	/** MIME type for the stored blob, e.g. `image/png` or `video/mp4`. */
	contentType?: string;
}

/** Metadata returned by {@link ChatCoreBlobStorage.stat}. */
export interface ChatCoreBlobMetadata {
	/** Blob size in bytes. */
	size: number;
	/** MIME type, when the backend stores or can infer one. */
	contentType?: string;
	/** Backend-specific entity tag, when available. */
	etag?: string;
	/** Last modified time as epoch milliseconds, when available. */
	lastModified?: number;
}

/**
 * Optional blob storage backend for media, attachments, exports, and other
 * large binary payloads.
 *
 * ChatCore event storage remains database-backed. Blob storage is deliberately
 * separate so applications can keep events queryable while routing large files
 * to S3, GCS, Azure Blob, local files, OpenDAL, or another object store.
 */
export interface ChatCoreBlobStorage {
	/** Store or replace a blob at `key`. */
	write(
		key: string,
		data: Uint8Array,
		options?: ChatCoreBlobWriteOptions,
	): Promise<void>;
	/** Read a blob, returning `null` when the key does not exist. */
	read(key: string): Promise<Uint8Array | null>;
	/** Return blob metadata, or `null` when the key does not exist. */
	stat(key: string): Promise<ChatCoreBlobMetadata | null>;
	/** Delete a blob. Missing keys should be treated as already deleted. */
	delete(key: string): Promise<void>;
	/**
	 * Create a time-limited read URL when the backend supports presigning.
	 * Backends without URL signing can omit this method.
	 */
	presignRead?(key: string, expiresSeconds: number): Promise<string>;
}
