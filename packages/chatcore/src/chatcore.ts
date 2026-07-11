import type { ChatCoreBlobMetadata } from "./blob-storage";
import { createFlowAdapter } from "./db/adapter";
import { createSequencer } from "./db/sequence";
import type { CreateBlobReadUrlInput, PutBlobInput } from "./engine/blobs";
import { createBlobMethods } from "./engine/blobs";
import { createPublishMethod } from "./engine/publish";
import { createRoomMethods } from "./engine/rooms";
import { createStateMethods } from "./engine/state";
import { createSyncMethods } from "./engine/sync";
import { createTimelineMethods } from "./engine/timeline";
import type { ChatCoreOptions } from "./options";
import type {
	CreateRoomInput,
	FlowEvent,
	GetSyncStreamOptions,
	GetTimelineOptions,
	ListRoomsOptions,
	PublishEventInput,
	PublishEventResult,
	Room,
	SyncStreamResult,
} from "./types";

/** The ChatCore engine instance returned by {@link createChatCore}. */
export interface ChatCore {
	/** The resolved options. */
	readonly options: ChatCoreOptions;
	createRoom(input: CreateRoomInput): Promise<Room>;
	getRoom(roomId: string): Promise<Room | null>;
	listRooms(options?: ListRoomsOptions): Promise<Room[]>;
	publishEvent(input: PublishEventInput): Promise<PublishEventResult>;
	getRoomState(roomId: string): Promise<FlowEvent[]>;
	getRoomTimeline(
		roomId: string,
		options?: GetTimelineOptions,
	): Promise<FlowEvent[]>;
	getSyncStream(options?: GetSyncStreamOptions): Promise<SyncStreamResult>;
	/** Store or replace a blob in the configured blob storage backend. */
	putBlob(input: PutBlobInput): Promise<void>;
	/** Read a blob from the configured blob storage backend. */
	getBlob(key: string): Promise<Uint8Array | null>;
	/** Return blob metadata from the configured blob storage backend. */
	getBlobMetadata(key: string): Promise<ChatCoreBlobMetadata | null>;
	/** Delete a blob from the configured blob storage backend. */
	deleteBlob(key: string): Promise<void>;
	/** Create a time-limited read URL when the blob backend supports it. */
	createBlobReadUrl(input: CreateBlobReadUrlInput): Promise<string>;
}

/**
 * Create an in-process, event-sourced messaging engine backed by the supplied
 * ChatCore storage backend.
 *
 * @example
 * ```ts
 * import { createChatCore } from "chatcore";
 *
 * const flow = createChatCore({ storage });
 * const room = await flow.createRoom({ creatorId: "u1" });
 * await flow.publishEvent({
 *   roomId: room.id,
 *   senderId: "u1",
 *   type: "message.text",
 *   content: { body: "hello" },
 * });
 * const { events, nextToken } = await flow.getSyncStream({ sinceSequenceId: 0 });
 * ```
 */
export function createChatCore(options: ChatCoreOptions): ChatCore {
	const adapter = createFlowAdapter(options);
	const sequencer = createSequencer(adapter);
	const defaultLimit = options.defaultLimit ?? 100;

	const { createRoom, getRoom, listRooms } = createRoomMethods(
		adapter,
		defaultLimit,
	);
	const { publishEvent } = createPublishMethod(adapter, sequencer, {
		maxContentBytes: options.maxContentBytes,
	});
	const { getRoomState } = createStateMethods(adapter);
	const { getRoomTimeline } = createTimelineMethods(adapter, defaultLimit);
	const { getSyncStream } = createSyncMethods(adapter, defaultLimit);
	const { putBlob, getBlob, getBlobMetadata, deleteBlob, createBlobReadUrl } =
		createBlobMethods(options.blobStorage);

	return {
		options,
		createRoom,
		getRoom,
		listRooms,
		publishEvent,
		getRoomState,
		getRoomTimeline,
		getSyncStream,
		putBlob,
		getBlob,
		getBlobMetadata,
		deleteBlob,
		createBlobReadUrl,
	};
}
