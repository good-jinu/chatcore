import * as z from "zod";
import type { JsonObject, JsonValue } from "../types";

/** Thrown when an SDK method receives invalid input. */
export interface ChatCoreError extends Error {
	name: "ChatCoreError";
}

interface ChatCoreErrorConstructor {
	new (message: string): ChatCoreError;
	(message: string): ChatCoreError;
	prototype: ChatCoreError;
}

function ChatCoreErrorImpl(
	this: ChatCoreError | undefined,
	message: string,
): ChatCoreError {
	const error = new Error(message) as ChatCoreError;
	error.name = "ChatCoreError";
	Object.setPrototypeOf(error, ChatCoreErrorImpl.prototype);
	return error;
}

ChatCoreErrorImpl.prototype = Object.create(Error.prototype) as ChatCoreError;
Object.defineProperty(ChatCoreErrorImpl.prototype, "constructor", {
	value: ChatCoreErrorImpl,
	writable: true,
	configurable: true,
});

export const ChatCoreError = ChatCoreErrorImpl as ChatCoreErrorConstructor;

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([
		z.string(),
		z.number().finite(),
		z.boolean(),
		z.null(),
		z.array(jsonValueSchema),
		z.record(z.string(), jsonValueSchema),
	]),
);

const jsonObjectSchema: z.ZodType<JsonObject> = z.record(
	z.string(),
	jsonValueSchema,
);

const createRoomSchema = z.object({
	creatorId: z.string().min(1, "creatorId is required"),
	metadata: jsonObjectSchema.optional(),
});

const publishEventSchema = z.object({
	roomId: z.string().min(1, "roomId is required"),
	senderId: z.string().min(1, "senderId is required"),
	type: z.string().min(1, "type is required"),
	stateKey: z.string().optional(),
	content: jsonObjectSchema.optional(),
	parentEventIds: z.array(z.string().min(1)).optional(),
});

/** Validate and normalize {@link createRoom} input, throwing on error. */
export function parseCreateRoomInput(input: unknown) {
	const result = createRoomSchema.safeParse(input);
	if (!result.success) {
		throw new ChatCoreError(
			`Invalid createRoom input: ${result.error.issues.map((i) => i.message).join(", ")}`,
		);
	}
	return result.data;
}

/** Validate and normalize {@link publishEvent} input, throwing on error. */
export function parsePublishEventInput(input: unknown) {
	const result = publishEventSchema.safeParse(input);
	if (!result.success) {
		throw new ChatCoreError(
			`Invalid publishEvent input: ${result.error.issues.map((i) => i.message).join(", ")}`,
		);
	}
	return result.data;
}
