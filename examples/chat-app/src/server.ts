import { mkdir, readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import type {
	ChatCoreStorage,
	ChatCoreStorageRow,
	ChatCoreStorageWhere,
	FlowEvent,
	JsonObject,
	Room,
} from "chatcore";
import { createChatCore, generateId } from "chatcore";
import type { RawBuilder } from "kysely";
import { Kysely, SqliteDialect, sql } from "kysely";
import { ensureChatCoreSchema } from "./schema.js";

type JsonRecord = Record<string, unknown>;

interface ChatCoreSqliteSchema {
	room: {
		id: string;
		creatorId: string;
		createdAt: number;
		metadata: string;
	};
	event: {
		id: string;
		roomId: string;
		senderId: string;
		type: string;
		stateKey: string | null;
		content: string;
		timestamp: number;
		sequenceId: number;
	};
	eventEdge: {
		id: string;
		eventId: string;
		parentEventId: string;
	};
	roomState: {
		id: string;
		roomId: string;
		eventType: string;
		stateKey: string;
		eventId: string;
	};
	sequence: {
		id: string;
		name: string;
		value: number;
	};
}

interface SerializedRoom {
	id: string;
	creatorId: string;
	createdAt: number;
	name: string;
	topic: string;
}

interface SerializedEvent {
	id: string;
	roomId: string;
	senderId: string;
	displayName: string;
	type: string;
	body: string;
	content: JsonObject;
	timestamp: number;
	sequenceId: number;
}

interface Member {
	userId: string;
	displayName: string;
}

interface SseClient {
	response: ServerResponse;
}

type SsePayload =
	| { type: "event"; event: SerializedEvent }
	| { type: "room.created"; room: SerializedRoom }
	| { type: "sync"; events: SerializedEvent[]; nextToken: number };

const host = process.env.HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "5173", 10);
const projectDir = fileURLToPath(new URL("../", import.meta.url));
const publicDir = join(projectDir, "public");
const schemaPath = join(projectDir, "schema", "chatcore.sql");
const dataDir = join(projectDir, "data");
const databasePath =
	process.env.DATABASE_URL ?? join(dataDir, "chatcore.sqlite");
const clientScriptPath = join(projectDir, "dist", "client.js");
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

await mkdir(dataDir, { recursive: true });
const sqlite = new Database(databasePath);
await ensureChatCoreSchema({ db: sqlite, databasePath, schemaPath });
const database = new Kysely<ChatCoreSqliteSchema>({
	dialect: new SqliteDialect({ database: sqlite }),
});

const flow = createChatCore({
	storage: createKyselyChatCoreStorage(database),
	defaultLimit: 100,
});
const rooms = new Map<string, Room>();
const clients = new Set<SseClient>();

await loadRooms();
if (rooms.size === 0) {
	const general = await createRoom({
		creatorId: "system",
		name: "General",
		topic: "A shared room backed by ChatCore events in SQLite.",
	});
	await publishSystemMessage(
		general.id,
		"Welcome. This room is persisted in examples/chat-app/data/chatcore.sqlite.",
	);
}

function createKyselyChatCoreStorage(
	db: Kysely<ChatCoreSqliteSchema>,
): ChatCoreStorage {
	return {
		async create({ model, data }) {
			const table = asTableName(model);
			const row = encodeStorageRow({ id: generateId(), ...data });
			const entries = Object.entries(row);
			await sql`
				insert into ${sql.table(table)}
				(${sql.join(entries.map(([field]) => sql.id(field)))})
				values (${sql.join(entries.map(([, value]) => value))})
			`.execute(db);
			return decodeStorageRow(row);
		},
		async findOne({ model, where }) {
			const rows = await this.findMany({ model, where, limit: 1 });
			return rows[0] ?? null;
		},
		async findMany({ model, where, sortBy, limit, offset }) {
			const table = asTableName(model);
			const order = sortBy
				? sql`order by ${sql.id(sortBy.field)} ${sql.raw(sortBy.direction)}`
				: sql``;
			const pageLimit = limit !== undefined ? sql`limit ${limit}` : sql``;
			const pageOffset = offset !== undefined ? sql`offset ${offset}` : sql``;
			const result = await sql<Record<string, unknown>>`
				select * from ${sql.table(table)}
				${whereSql(where)}
				${order}
				${pageLimit}
				${pageOffset}
			`.execute(db);
			const rows = result.rows;
			return rows.map((row) => decodeStorageRow(row));
		},
		async update({ model, where, update }) {
			const existing = await this.findOne({ model, where });
			if (existing === null) return null;

			const table = asTableName(model);
			const entries = Object.entries(encodeStorageRow(update));
			await sql`
				update ${sql.table(table)}
				set ${sql.join(
					entries.map(([field, value]) => sql`${sql.id(field)} = ${value}`),
				)}
				${whereSql(where)}
			`.execute(db);
			return { ...existing, ...update };
		},
		async count({ model, where }) {
			const table = asTableName(model);
			const result = await sql<{ count: number }>`
				select count(*) as count from ${sql.table(table)}
				${whereSql(where)}
			`.execute(db);
			return Number(result.rows[0]?.count ?? 0);
		},
	};
}

function asTableName(model: string): keyof ChatCoreSqliteSchema {
	if (
		model === "room" ||
		model === "event" ||
		model === "eventEdge" ||
		model === "roomState" ||
		model === "sequence"
	) {
		return model;
	}
	throw new Error(`Unknown ChatCore storage model: ${model}`);
}

function encodeStorageRow(
	row: ChatCoreStorageRow,
): Record<string, string | number | null> {
	const encoded: Record<string, string | number | null> = {};
	for (const [key, value] of Object.entries(row)) {
		encoded[key] =
			key === "metadata" || key === "content"
				? JSON.stringify(value ?? {})
				: encodeStorageValue(value);
	}
	return encoded;
}

function encodeStorageValue(value: unknown): string | number | null {
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		value === null
	) {
		return value;
	}
	if (typeof value === "boolean") return value ? 1 : 0;
	if (isTemporalValue(value)) return value.toString();
	return String(value);
}

function isTemporalValue(value: unknown): value is Temporal.Instant {
	return (
		typeof value === "object" &&
		value !== null &&
		Object.prototype.toString.call(value).startsWith("[object Temporal.")
	);
}

function decodeStorageRow(row: Record<string, unknown>): ChatCoreStorageRow {
	const decoded: ChatCoreStorageRow = {};
	for (const [key, value] of Object.entries(row)) {
		decoded[key] =
			(key === "metadata" || key === "content") && typeof value === "string"
				? JSON.parse(value)
				: value;
	}
	return decoded;
}

function whereSql(where?: ChatCoreStorageWhere[]): RawBuilder<unknown> {
	if (where === undefined || where.length === 0) return sql``;
	return sql`where ${sql.join(where.map(whereClauseSql), sql` and `)}`;
}

function whereClauseSql({
	field,
	value,
	operator = "eq",
}: ChatCoreStorageWhere): RawBuilder<unknown> {
	if (operator === "in") {
		if (!Array.isArray(value)) {
			throw new Error(`Expected array value for IN filter on ${field}`);
		}
		return sql`${sql.id(field)} in (${sql.join(value)})`;
	}
	if (value === null && operator === "eq") return sql`${sql.id(field)} is null`;
	if (value === null && operator === "ne") {
		return sql`${sql.id(field)} is not null`;
	}

	const comparisonOperator = {
		eq: "=",
		ne: "!=",
		lt: "<",
		lte: "<=",
		gt: ">",
		gte: ">=",
		contains: "like",
		starts_with: "like",
		ends_with: "like",
	}[operator];
	const comparisonValue =
		operator === "contains"
			? `%${String(value)}%`
			: operator === "starts_with"
				? `${String(value)}%`
				: operator === "ends_with"
					? `%${String(value)}`
					: value;
	return sql`${sql.id(field)} ${sql.raw(comparisonOperator)} ${comparisonValue}`;
}

function jsonResponse(
	response: ServerResponse,
	status: number,
	payload: unknown,
): void {
	const body = JSON.stringify(payload);
	response.writeHead(status, {
		"content-length": String(textEncoder.encode(body).byteLength),
		"content-type": "application/json; charset=utf-8",
	});
	response.end(body);
}

function textResponse(
	response: ServerResponse,
	status: number,
	body: string,
): void {
	response.writeHead(status, {
		"content-length": String(textEncoder.encode(body).byteLength),
		"content-type": "text/plain; charset=utf-8",
	});
	response.end(body);
}

async function readJson(request: IncomingMessage): Promise<JsonRecord> {
	const chunks: Uint8Array[] = [];
	for await (const chunk of request) {
		chunks.push(
			typeof chunk === "string"
				? textEncoder.encode(chunk)
				: new Uint8Array(chunk),
		);
	}
	if (chunks.length === 0) return {};

	const byteLength = chunks.reduce(
		(total, chunk) => total + chunk.byteLength,
		0,
	);
	const body = new Uint8Array(byteLength);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}

	const parsed: unknown = JSON.parse(textDecoder.decode(body));
	return asObject(parsed);
}

function asObject(value: unknown): JsonRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as JsonRecord)
		: {};
}

function asString(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value.trim() : fallback;
}

function eventBody(event: FlowEvent): string {
	return typeof event.content.body === "string" ? event.content.body : "";
}

function eventDisplayName(event: FlowEvent): string {
	return typeof event.content.displayName === "string"
		? event.content.displayName
		: event.senderId;
}

function serializeEvent(event: FlowEvent): SerializedEvent {
	return {
		id: event.id,
		roomId: event.roomId,
		senderId: event.senderId,
		displayName: eventDisplayName(event),
		type: event.type,
		body: eventBody(event),
		content: event.content,
		timestamp: event.timestamp,
		sequenceId: event.sequenceId,
	};
}

function serializeRoom(room: Room): SerializedRoom {
	return {
		id: room.id,
		creatorId: room.creatorId,
		createdAt: room.createdAt,
		name:
			typeof room.metadata.name === "string"
				? room.metadata.name
				: "Untitled room",
		topic: typeof room.metadata.topic === "string" ? room.metadata.topic : "",
	};
}

function sendSse(client: SseClient, payload: SsePayload): void {
	client.response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(payload: SsePayload): void {
	for (const client of clients) {
		sendSse(client, payload);
	}
}

async function createRoom(input: {
	creatorId: string;
	name: string;
	topic?: string;
}): Promise<Room> {
	const room = await flow.createRoom({
		creatorId: input.creatorId,
		metadata: { name: input.name, topic: input.topic ?? "" },
	});
	rooms.set(room.id, room);
	return room;
}

async function loadRooms(): Promise<void> {
	for (const room of await flow.listRooms({ limit: 500, order: "asc" })) {
		rooms.set(room.id, room);
	}
}

async function publishSystemMessage(
	roomId: string,
	body: string,
): Promise<FlowEvent> {
	const result = await flow.publishEvent({
		roomId,
		senderId: "system",
		type: "message.text",
		content: { body, displayName: "System" },
	});
	return result.event;
}

async function publishMemberState(
	roomId: string,
	userId: string,
	displayName: string,
) {
	return flow.publishEvent({
		roomId,
		senderId: userId,
		type: "room.member",
		stateKey: userId,
		content: { membership: "join", displayName },
	});
}

async function listMembers(roomId: string): Promise<Member[]> {
	const state = await flow.getRoomState(roomId);
	return state
		.filter((event) => event.type === "room.member")
		.map((event) => ({
			userId: event.stateKey ?? event.senderId,
			displayName: eventDisplayName(event),
		}))
		.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

async function handleApi(
	request: IncomingMessage,
	response: ServerResponse,
	url: URL,
): Promise<void> {
	if (request.method === "GET" && url.pathname === "/api/bootstrap") {
		jsonResponse(response, 200, {
			rooms: Array.from(rooms.values()).map(serializeRoom),
		});
		return;
	}

	if (request.method === "POST" && url.pathname === "/api/rooms") {
		const input = await readJson(request);
		const name = asString(input.name, "New room");
		const creatorId = asString(input.creatorId, "guest");
		const topic = asString(input.topic);
		const room = await createRoom({ creatorId, name, topic });
		const serialized = serializeRoom(room);
		broadcast({ type: "room.created", room: serialized });
		jsonResponse(response, 201, { room: serialized });
		return;
	}

	const timelineMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/timeline$/);
	if (request.method === "GET" && timelineMatch?.[1] !== undefined) {
		const roomId = decodeURIComponent(timelineMatch[1]);
		if (!rooms.has(roomId)) {
			jsonResponse(response, 404, { error: "Room not found" });
			return;
		}
		const events = await flow.getRoomTimeline(roomId, { limit: 100 });
		jsonResponse(response, 200, {
			events: events.slice().reverse().map(serializeEvent),
			members: await listMembers(roomId),
		});
		return;
	}

	const joinMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/join$/);
	if (request.method === "POST" && joinMatch?.[1] !== undefined) {
		const roomId = decodeURIComponent(joinMatch[1]);
		if (!rooms.has(roomId)) {
			jsonResponse(response, 404, { error: "Room not found" });
			return;
		}
		const input = await readJson(request);
		const userId = asString(input.userId, "guest");
		const displayName = asString(input.displayName, userId);
		const { event } = await publishMemberState(roomId, userId, displayName);
		const payload: SsePayload = { type: "event", event: serializeEvent(event) };
		broadcast(payload);
		jsonResponse(response, 200, {
			event: payload.event,
			members: await listMembers(roomId),
		});
		return;
	}

	const messageMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/messages$/);
	if (request.method === "POST" && messageMatch?.[1] !== undefined) {
		const roomId = decodeURIComponent(messageMatch[1]);
		if (!rooms.has(roomId)) {
			jsonResponse(response, 404, { error: "Room not found" });
			return;
		}
		const input = await readJson(request);
		const body = asString(input.body);
		if (body.length === 0) {
			jsonResponse(response, 400, { error: "Message body is required" });
			return;
		}
		const senderId = asString(input.senderId, "guest");
		const displayName = asString(input.displayName, senderId);
		const { event } = await flow.publishEvent({
			roomId,
			senderId,
			type: "message.text",
			content: { body, displayName },
		});
		const payload: SsePayload = { type: "event", event: serializeEvent(event) };
		broadcast(payload);
		jsonResponse(response, 201, { event: payload.event });
		return;
	}

	if (request.method === "GET" && url.pathname === "/api/events") {
		response.writeHead(200, {
			"cache-control": "no-cache, no-transform",
			connection: "keep-alive",
			"content-type": "text/event-stream; charset=utf-8",
		});
		response.write("\n");

		const client = { response };
		clients.add(client);

		const since = Number.parseInt(url.searchParams.get("since") ?? "0", 10);
		const sync = await flow.getSyncStream({
			sinceSequenceId: Number.isFinite(since) ? since : 0,
		});
		sendSse(client, {
			type: "sync",
			events: sync.events.map(serializeEvent),
			nextToken: sync.nextToken,
		});

		request.on("close", () => {
			clients.delete(client);
		});
		return;
	}

	jsonResponse(response, 404, { error: "Not found" });
}

async function serveStatic(
	response: ServerResponse,
	pathname: string,
): Promise<void> {
	const requested = pathname === "/" ? "/index.html" : pathname;
	const normalized = normalize(decodeURIComponent(requested)).replace(
		/^(\.\.[/\\])+/,
		"",
	);
	const filePath =
		normalized === "/app.js" ? clientScriptPath : join(publicDir, normalized);
	if (filePath !== clientScriptPath && !filePath.startsWith(publicDir)) {
		textResponse(response, 403, "Forbidden");
		return;
	}

	const contentTypes: Record<string, string> = {
		".css": "text/css; charset=utf-8",
		".html": "text/html; charset=utf-8",
		".js": "text/javascript; charset=utf-8",
	};

	try {
		const body = await readFile(filePath);
		response.writeHead(200, {
			"content-length": String(body.byteLength),
			"content-type":
				contentTypes[extname(filePath)] ?? "application/octet-stream",
		});
		response.end(body);
	} catch {
		textResponse(response, 404, "Not found");
	}
}

const server = createServer((request, response) => {
	const url = new URL(
		request.url ?? "/",
		`http://${request.headers.host ?? "localhost"}`,
	);
	const task = url.pathname.startsWith("/api/")
		? handleApi(request, response, url)
		: serveStatic(response, url.pathname);

	task.catch((error: unknown) => {
		console.error(error);
		if (!response.headersSent) {
			jsonResponse(response, 500, { error: "Internal server error" });
			return;
		}
		response.end();
	});
});

server.listen(port, host, () => {
	console.log(`ChatCore example listening on http://${host}:${port}`);
});
