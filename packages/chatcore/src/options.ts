import type { ChatCoreBlobStorage } from "./blob-storage";
import type { ChatCoreStorage } from "./storage";

/**
 * Configuration for {@link createChatCore}.
 */
export interface ChatCoreOptions {
	/**
	 * Storage backend used by ChatCore. Applications can implement this with
	 * Kysely, Drizzle, Prisma, raw SQL, or any other persistence layer.
	 */
	storage: ChatCoreStorage;
	/**
	 * Optional blob storage backend used for media, attachments, exports, and
	 * other large binary payloads. Event data stays in `storage`; blob events
	 * should store object keys in their JSON content.
	 */
	blobStorage?: ChatCoreBlobStorage;
	/**
	 * Default page size for {@link ChatCore.getRoomTimeline} and
	 * {@link ChatCore.getSyncStream}.
	 *
	 * @default 100
	 */
	defaultLimit?: number;
	/**
	 * Maximum allowed byte length of the serialized `content` payload per
	 * event (`JSON.stringify` UTF-8 byte length). When set, {@link ChatCore.publishEvent}
	 * rejects oversized content with a `ChatCoreError`. The host owns this
	 * number; omit for no limit (today's behavior).
	 *
	 * @default undefined (unbounded)
	 */
	maxContentBytes?: number;
}
