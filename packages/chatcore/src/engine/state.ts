import type { FlowAdapter } from "../db/adapter";
import { toEvent } from "../db/rows";
import type { FlowEvent } from "../types";

interface UpsertStateArgs {
	roomId: string;
	eventType: string;
	stateKey: string;
	eventId: string;
}

/**
 * Upsert the projected room-state cache under the composite key
 * `[roomId, eventType, stateKey]`, pointing it at the newest state event.
 */
export async function upsertRoomState(
	adapter: FlowAdapter,
	{ roomId, eventType, stateKey, eventId }: UpsertStateArgs,
): Promise<void> {
	const existing = await adapter.findOne({
		model: "roomState",
		where: [
			{ field: "roomId", value: roomId },
			{ field: "eventType", value: eventType },
			{ field: "stateKey", value: stateKey },
		],
	});

	if (existing) {
		await adapter.update({
			model: "roomState",
			where: [
				{ field: "roomId", value: roomId },
				{ field: "eventType", value: eventType },
				{ field: "stateKey", value: stateKey },
			],
			update: { eventId },
		});
		return;
	}

	await adapter.create({
		model: "roomState",
		data: { roomId, eventType, stateKey, eventId },
	});
}

/** Read methods over the projected room state. */
export function createStateMethods(adapter: FlowAdapter) {
	/**
	 * Return the active state events for a room (the latest event per
	 * `[type, stateKey]`), resolved from the projection cache.
	 */
	async function getRoomState(roomId: string): Promise<FlowEvent[]> {
		const stateRows = await adapter.findMany({
			model: "roomState",
			where: [{ field: "roomId", value: roomId }],
		});

		const events: FlowEvent[] = [];
		for (const state of stateRows) {
			const event = await adapter.findOne({
				model: "event",
				where: [{ field: "id", value: String(state.eventId) }],
			});
			if (event) {
				events.push(toEvent(event));
			}
		}
		return events;
	}

	return { getRoomState };
}
