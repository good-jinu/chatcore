import type { ChatCore } from "../chatcore";
import { createChatCore } from "../chatcore";
import type { ChatCoreOptions } from "../options";
import { createMemoryBlobStorage } from "./memory-blob-storage";
import type { MemoryDatabase } from "./memory-storage";
import { createMemoryStorage } from "./memory-storage";

export { createMemoryBlobStorage };
export type { MemoryBlobRecord } from "./memory-blob-storage";
export type { MemoryDatabase } from "./memory-storage";

/** The object returned by {@link getTestInstance}. */
export interface TestInstance {
	/** A ChatCore engine backed by an in-memory store. */
	flow: ChatCore;
	/** The raw in-memory tables, for direct assertions. */
	db: MemoryDatabase;
}

/**
 * Spin up a ChatCore engine backed by the corrected in-memory adapter.
 * Mirrors the `getTestInstance()` ergonomics used elsewhere in the workspace.
 */
export function getTestInstance(
	options?: Partial<Omit<ChatCoreOptions, "storage">>,
): TestInstance {
	const db: MemoryDatabase = {
		room: [],
		event: [],
		eventEdge: [],
		roomState: [],
		sequence: [],
	};
	const flow = createChatCore({
		storage: createMemoryStorage(db),
		...options,
	});
	return { flow, db };
}
