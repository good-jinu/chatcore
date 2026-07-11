import type { FlowAdapter } from "../db/adapter";
import { toEvent } from "../db/rows";
import type { ChatCoreStorageWhere } from "../storage";
import type { FlowEvent, GetTimelineOptions } from "../types";

/** Timeline read methods. */
export function createTimelineMethods(
	adapter: FlowAdapter,
	defaultLimit: number,
) {
	/**
	 * Return a room's events newest-first, optionally paginating backwards with
	 * `beforeSequenceId`.
	 */
	async function getRoomTimeline(
		roomId: string,
		{ limit, beforeSequenceId }: GetTimelineOptions = {},
	): Promise<FlowEvent[]> {
		const where: ChatCoreStorageWhere[] = [{ field: "roomId", value: roomId }];
		if (beforeSequenceId !== undefined) {
			where.push({
				field: "sequenceId",
				value: beforeSequenceId,
				operator: "lt",
			});
		}

		const rows = await adapter.findMany({
			model: "event",
			where,
			sortBy: { field: "sequenceId", direction: "desc" },
			limit: limit ?? defaultLimit,
		});

		return rows.map(toEvent);
	}

	return { getRoomTimeline };
}
