import type {
	ChatCoreBlobMetadata,
	ChatCoreBlobStorage,
	ChatCoreBlobWriteOptions,
} from "../blob-storage";
import { ChatCoreError } from "../utils/validate";

export interface PutBlobInput extends ChatCoreBlobWriteOptions {
	/** Object key relative to the configured blob storage root. */
	key: string;
	/** Binary payload to store. */
	data: Uint8Array;
}

export interface CreateBlobReadUrlInput {
	/** Object key relative to the configured blob storage root. */
	key: string;
	/** URL lifetime in seconds. */
	expiresSeconds: number;
}

/** Blob storage methods. */
export function createBlobMethods(blobStorage?: ChatCoreBlobStorage) {
	function requireBlobStorage(): ChatCoreBlobStorage {
		if (!blobStorage) {
			throw new ChatCoreError(
				"blob storage is not configured; pass blobStorage to createChatCore",
			);
		}
		return blobStorage;
	}

	/** Store or replace a blob. */
	async function putBlob({
		key,
		data,
		contentType,
	}: PutBlobInput): Promise<void> {
		validateBlobKey(key);
		if (!(data instanceof Uint8Array)) {
			throw new ChatCoreError("blob data must be a Uint8Array");
		}
		await requireBlobStorage().write(key, data, { contentType });
	}

	/** Read a blob, returning `null` when it does not exist. */
	async function getBlob(key: string): Promise<Uint8Array | null> {
		validateBlobKey(key);
		return requireBlobStorage().read(key);
	}

	/** Return blob metadata, or `null` when it does not exist. */
	async function getBlobMetadata(
		key: string,
	): Promise<ChatCoreBlobMetadata | null> {
		validateBlobKey(key);
		return requireBlobStorage().stat(key);
	}

	/** Delete a blob. Missing keys are treated as already deleted. */
	async function deleteBlob(key: string): Promise<void> {
		validateBlobKey(key);
		await requireBlobStorage().delete(key);
	}

	/** Create a time-limited read URL when the configured backend supports it. */
	async function createBlobReadUrl({
		key,
		expiresSeconds,
	}: CreateBlobReadUrlInput): Promise<string> {
		validateBlobKey(key);
		if (!Number.isFinite(expiresSeconds) || expiresSeconds <= 0) {
			throw new ChatCoreError("expiresSeconds must be a positive number");
		}
		const storage = requireBlobStorage();
		if (!storage.presignRead) {
			throw new ChatCoreError("blob storage does not support presigned reads");
		}
		return storage.presignRead(key, expiresSeconds);
	}

	return {
		putBlob,
		getBlob,
		getBlobMetadata,
		deleteBlob,
		createBlobReadUrl,
	};
}

function validateBlobKey(key: string): void {
	if (typeof key !== "string" || key.length === 0) {
		throw new ChatCoreError("blob key is required");
	}
	if (key.startsWith("/") || key.includes("\\")) {
		throw new ChatCoreError("blob key must be a relative forward-slash path");
	}
	const segments = key.split("/");
	if (
		segments.some(
			(segment) => segment.length === 0 || segment === "." || segment === "..",
		)
	) {
		throw new ChatCoreError(
			"blob key cannot contain empty, '.', or '..' segments",
		);
	}
}
