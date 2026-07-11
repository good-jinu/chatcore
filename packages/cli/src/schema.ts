import type { TablesSchema } from "unadapter/types";

export const chatCoreTables = {
	room: {
		modelName: "room",
		order: 1,
		fields: {
			creatorId: { type: "string", required: true },
			createdAt: { type: "number", required: true, bigint: true },
			metadata: { type: "json", required: true },
		},
	},
	event: {
		modelName: "event",
		order: 2,
		fields: {
			roomId: {
				type: "string",
				required: true,
				references: { model: "room", field: "id", onDelete: "cascade" },
			},
			senderId: { type: "string", required: true },
			type: { type: "string", required: true },
			stateKey: { type: "string", required: false },
			content: { type: "json", required: true },
			timestamp: { type: "number", required: true, bigint: true },
			sequenceId: {
				type: "number",
				required: true,
				bigint: true,
				unique: true,
			},
		},
	},
	eventEdge: {
		modelName: "eventEdge",
		order: 3,
		fields: {
			eventId: {
				type: "string",
				required: true,
				references: { model: "event", field: "id", onDelete: "cascade" },
			},
			parentEventId: { type: "string", required: true },
		},
	},
	roomState: {
		modelName: "roomState",
		order: 4,
		fields: {
			roomId: {
				type: "string",
				required: true,
				references: { model: "room", field: "id", onDelete: "cascade" },
			},
			eventType: { type: "string", required: true },
			stateKey: { type: "string", required: true },
			eventId: {
				type: "string",
				required: true,
				references: { model: "event", field: "id", onDelete: "cascade" },
			},
		},
	},
	sequence: {
		modelName: "sequence",
		order: 5,
		fields: {
			name: { type: "string", required: true, unique: true },
			value: { type: "number", required: true, bigint: true },
		},
	},
} satisfies TablesSchema;

/** Return ChatCore's canonical storage schema in unadapter table format. */
export function getChatCoreTables(): TablesSchema {
	return chatCoreTables;
}
