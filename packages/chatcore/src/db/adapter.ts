import type { ChatCoreOptions } from "../options";
import type { ChatCoreStorage } from "../storage";

export type FlowAdapter = ChatCoreStorage;

/** Build the ChatCore storage adapter from user options. */
export function createFlowAdapter(options: ChatCoreOptions): FlowAdapter {
	return options.storage;
}
