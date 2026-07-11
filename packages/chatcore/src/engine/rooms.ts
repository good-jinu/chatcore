import type { FlowAdapter } from "../db/adapter";
import { toRoom } from "../db/rows";
import type { CreateRoomInput, ListRoomsOptions, Room } from "../types";
import { nowEpochMilliseconds } from "../utils/time";
import { parseCreateRoomInput } from "../utils/validate";

/** Room lifecycle methods. */
export function createRoomMethods(adapter: FlowAdapter, defaultLimit: number) {
	/** Create a new, isolated conversation boundary. */
	async function createRoom(input: CreateRoomInput): Promise<Room> {
		const data = parseCreateRoomInput(input);
		const row = await adapter.create({
			model: "room",
			data: {
				creatorId: data.creatorId,
				createdAt: nowEpochMilliseconds(),
				metadata: data.metadata ?? {},
			},
		});
		return toRoom(row);
	}

	/** Fetch a room by id, or `null` if it does not exist. */
	async function getRoom(roomId: string): Promise<Room | null> {
		const row = await adapter.findOne({
			model: "room",
			where: [{ field: "id", value: roomId }],
		});
		return row ? toRoom(row) : null;
	}

	/** List rooms by creation time. */
	async function listRooms({
		limit,
		order = "asc",
	}: ListRoomsOptions = {}): Promise<Room[]> {
		const rows = await adapter.findMany({
			model: "room",
			sortBy: { field: "createdAt", direction: order },
			limit: limit ?? defaultLimit,
		});
		return rows.map(toRoom);
	}

	return { createRoom, getRoom, listRooms };
}
