import type { FlowEvent, JsonObject, Room } from "../types";

/** Map a raw `room` row (post-transform) to a {@link Room}. */
export function toRoom(row: Record<string, unknown>): Room {
	return {
		id: String(row.id),
		creatorId: String(row.creatorId),
		createdAt: Number(row.createdAt),
		metadata: (row.metadata ?? {}) as JsonObject,
	};
}

/** Map a raw `event` row (post-transform) to a {@link FlowEvent}. */
export function toEvent(row: Record<string, unknown>): FlowEvent {
	return {
		id: String(row.id),
		roomId: String(row.roomId),
		senderId: String(row.senderId),
		type: String(row.type),
		stateKey:
			row.stateKey === undefined || row.stateKey === null
				? null
				: String(row.stateKey),
		content: (row.content ?? {}) as JsonObject,
		timestamp: Number(row.timestamp),
		sequenceId: Number(row.sequenceId),
	};
}
