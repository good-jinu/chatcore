import type { FlowAdapter } from "../db/adapter";
import { toEvent } from "../db/rows";
import type { Sequencer } from "../db/sequence";
import type { PublishEventInput, PublishEventResult } from "../types";
import { nowEpochMilliseconds } from "../utils/time";
import { ChatCoreError, parsePublishEventInput } from "../utils/validate";
import { upsertRoomState } from "./state";

/** The event publishing pipeline. */
export function createPublishMethod(
	adapter: FlowAdapter,
	sequencer: Sequencer,
	options: { maxContentBytes?: number } = {},
) {
	/**
	 * Publish an immutable event to a room's timeline.
	 *
	 * Integrity checks (room existence, parent event validity, content size)
	 * run **before** entering the sequencer so a rejection never burns a
	 * sequence id. The sequencer-serialized section only writes.
	 */
	async function publishEvent(
		input: PublishEventInput,
	): Promise<PublishEventResult> {
		const data = parsePublishEventInput(input);
		const isStateEvent = data.stateKey !== undefined;

		// Content size ceiling (cheap check first).
		if (options.maxContentBytes !== undefined) {
			const bytes = new TextEncoder().encode(
				JSON.stringify(data.content ?? {}),
			).byteLength;
			if (bytes > options.maxContentBytes) {
				throw new ChatCoreError(
					`content size ${bytes} bytes exceeds maxContentBytes (${options.maxContentBytes})`,
				);
			}
		}

		// Room must exist; reject before consuming a sequence id.
		const roomRow = await adapter.findOne({
			model: "room",
			where: [{ field: "id", value: data.roomId }],
		});
		if (!roomRow) {
			throw new ChatCoreError(`room not found: ${data.roomId}`);
		}

		// Each parent must exist and belong to the same room.
		if (data.parentEventIds?.length) {
			for (const parentId of data.parentEventIds) {
				const parentRow = await adapter.findOne({
					model: "event",
					where: [{ field: "id", value: parentId }],
				});
				if (!parentRow) {
					throw new ChatCoreError(`parent event not found: ${parentId}`);
				}
				if (String(parentRow.roomId) !== data.roomId) {
					throw new ChatCoreError(
						`parent event ${parentId} belongs to a different room`,
					);
				}
			}
		}

		return sequencer.withNextSequence(async (sequenceId) => {
			const row = await adapter.create({
				model: "event",
				data: {
					roomId: data.roomId,
					senderId: data.senderId,
					type: data.type,
					stateKey: isStateEvent ? data.stateKey : null,
					content: data.content ?? {},
					timestamp: nowEpochMilliseconds(),
					sequenceId,
				},
			});
			const event = toEvent(row);

			if (data.parentEventIds?.length) {
				for (const parentEventId of data.parentEventIds) {
					await adapter.create({
						model: "eventEdge",
						data: { eventId: event.id, parentEventId },
					});
				}
			}

			if (isStateEvent) {
				await upsertRoomState(adapter, {
					roomId: data.roomId,
					eventType: data.type,
					stateKey: data.stateKey as string,
					eventId: event.id,
				});
			}

			return { event, sequenceId };
		});
	}

	return { publishEvent };
}
