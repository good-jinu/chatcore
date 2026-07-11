import { beforeEach, describe, expect, it } from "vitest";
import type { TestInstance } from "./test-utils";
import { createMemoryBlobStorage, getTestInstance } from "./test-utils";
import { ChatCoreError } from "./utils/validate";

// Helper: publish N events to a room
async function publishN(flow: TestInstance["flow"], roomId: string, n: number) {
	for (let i = 0; i < n; i++) {
		await flow.publishEvent({
			roomId,
			senderId: "u1",
			type: "msg",
			content: { i },
		});
	}
}

let t: TestInstance;

beforeEach(() => {
	t = getTestInstance();
});

describe("rooms", () => {
	it("creates and fetches a room", async () => {
		const room = await t.flow.createRoom({
			creatorId: "u1",
			metadata: { name: "general" },
		});
		expect(room.id).toBeTruthy();
		expect(room.creatorId).toBe("u1");
		expect(room.metadata).toEqual({ name: "general" });
		expect(typeof room.createdAt).toBe("number");

		const fetched = await t.flow.getRoom(room.id);
		expect(fetched).toEqual(room);
	});

	it("returns null for an unknown room", async () => {
		expect(await t.flow.getRoom("does-not-exist")).toBeNull();
	});

	it("lists rooms oldest-first by default", async () => {
		const first = await t.flow.createRoom({
			creatorId: "u1",
			metadata: { name: "first" },
		});
		const second = await t.flow.createRoom({
			creatorId: "u1",
			metadata: { name: "second" },
		});
		const roomRows = t.db.room!;
		roomRows[0]!.createdAt = 1;
		roomRows[1]!.createdAt = 2;

		const rooms = await t.flow.listRooms();
		expect(rooms.map((room) => room.id)).toEqual([first.id, second.id]);
	});

	it("lists rooms with order and limit options", async () => {
		await t.flow.createRoom({
			creatorId: "u1",
			metadata: { name: "first" },
		});
		const second = await t.flow.createRoom({
			creatorId: "u1",
			metadata: { name: "second" },
		});
		await t.flow.createRoom({
			creatorId: "u1",
			metadata: { name: "third" },
		});
		const roomRows = t.db.room!;
		roomRows[0]!.createdAt = 1;
		roomRows[1]!.createdAt = 2;
		roomRows[2]!.createdAt = 3;

		const rooms = await t.flow.listRooms({ order: "desc", limit: 2 });
		expect(rooms.map((room) => room.id)).toEqual([roomRows[2]!.id, second.id]);
	});

	it("rejects a room without a creator", async () => {
		await expect(
			// @ts-expect-error testing invalid input
			t.flow.createRoom({}),
		).rejects.toBeInstanceOf(ChatCoreError);
	});

	it("rejects metadata that is not JSON-serializable", async () => {
		await expect(
			t.flow.createRoom({
				creatorId: "u1",
				// @ts-expect-error testing invalid input
				metadata: { createdAt: Temporal.Now.instant() },
			}),
		).rejects.toBeInstanceOf(ChatCoreError);
	});
});

describe("publishEvent", () => {
	it("assigns strictly increasing, gap-free sequence ids", async () => {
		const room = await t.flow.createRoom({ creatorId: "u1" });
		const results = [];
		for (let i = 0; i < 5; i++) {
			results.push(
				await t.flow.publishEvent({
					roomId: room.id,
					senderId: "u1",
					type: "message.text",
					content: { body: `msg ${i}` },
				}),
			);
		}
		expect(results.map((r) => r.sequenceId)).toEqual([1, 2, 3, 4, 5]);
		expect(results[0]!.event.content).toEqual({ body: "msg 0" });
	});

	it("keeps sequence ids monotonic under concurrent publishes", async () => {
		const room = await t.flow.createRoom({ creatorId: "u1" });
		const published = await Promise.all(
			Array.from({ length: 25 }, (_, i) =>
				t.flow.publishEvent({
					roomId: room.id,
					senderId: "u1",
					type: "message.text",
					content: { i },
				}),
			),
		);
		const seqs = published.map((p) => p.sequenceId).sort((a, b) => a - b);
		expect(seqs).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
		expect(new Set(seqs).size).toBe(25);
	});

	it("persists edges for parent event ids", async () => {
		const room = await t.flow.createRoom({ creatorId: "u1" });
		const parent = await t.flow.publishEvent({
			roomId: room.id,
			senderId: "u1",
			type: "message.text",
			content: { body: "parent" },
		});
		const reply = await t.flow.publishEvent({
			roomId: room.id,
			senderId: "u2",
			type: "message.text",
			content: { body: "reply" },
			parentEventIds: [parent.event.id],
		});

		const edges = t.db.eventEdge!;
		expect(edges).toHaveLength(1);
		expect(edges[0]).toMatchObject({
			eventId: reply.event.id,
			parentEventId: parent.event.id,
		});
	});

	it("rejects an event missing required fields", async () => {
		await expect(
			t.flow.publishEvent({
				roomId: "",
				senderId: "u1",
				type: "message.text",
			}),
		).rejects.toBeInstanceOf(ChatCoreError);
	});

	it("rejects content that is not JSON-serializable", async () => {
		const room = await t.flow.createRoom({ creatorId: "u1" });
		await expect(
			t.flow.publishEvent({
				roomId: room.id,
				senderId: "u1",
				type: "message.text",
				// @ts-expect-error testing invalid input
				content: { sentAt: Temporal.Now.instant() },
			}),
		).rejects.toBeInstanceOf(ChatCoreError);
	});
});

describe("room state projection", () => {
	it("upserts the latest state event per [type, stateKey]", async () => {
		const room = await t.flow.createRoom({ creatorId: "u1" });
		await t.flow.publishEvent({
			roomId: room.id,
			senderId: "u1",
			type: "room.state.name",
			stateKey: "",
			content: { name: "first" },
		});
		const latest = await t.flow.publishEvent({
			roomId: room.id,
			senderId: "u1",
			type: "room.state.name",
			stateKey: "",
			content: { name: "second" },
		});

		const state = await t.flow.getRoomState(room.id);
		expect(state).toHaveLength(1);
		expect(state[0]!.id).toBe(latest.event.id);
		expect(state[0]!.content).toEqual({ name: "second" });
		// projection cache stores exactly one row for the composite key
		expect(t.db.roomState).toHaveLength(1);
	});

	it("tracks distinct state keys independently", async () => {
		const room = await t.flow.createRoom({ creatorId: "u1" });
		await t.flow.publishEvent({
			roomId: room.id,
			senderId: "u1",
			type: "room.member",
			stateKey: "u1",
			content: { membership: "join" },
		});
		await t.flow.publishEvent({
			roomId: room.id,
			senderId: "u2",
			type: "room.member",
			stateKey: "u2",
			content: { membership: "join" },
		});

		const state = await t.flow.getRoomState(room.id);
		expect(state).toHaveLength(2);
	});

	it("does not project non-state events", async () => {
		const room = await t.flow.createRoom({ creatorId: "u1" });
		await t.flow.publishEvent({
			roomId: room.id,
			senderId: "u1",
			type: "message.text",
			content: { body: "hi" },
		});
		expect(await t.flow.getRoomState(room.id)).toHaveLength(0);
	});
});

describe("getRoomTimeline", () => {
	it("returns events newest-first and respects limit + beforeSequenceId", async () => {
		const room = await t.flow.createRoom({ creatorId: "u1" });
		for (let i = 0; i < 5; i++) {
			await t.flow.publishEvent({
				roomId: room.id,
				senderId: "u1",
				type: "message.text",
				content: { i },
			});
		}

		const firstPage = await t.flow.getRoomTimeline(room.id, { limit: 2 });
		expect(firstPage.map((e) => e.sequenceId)).toEqual([5, 4]);

		const nextPage = await t.flow.getRoomTimeline(room.id, {
			limit: 2,
			beforeSequenceId: firstPage[firstPage.length - 1]!.sequenceId,
		});
		expect(nextPage.map((e) => e.sequenceId)).toEqual([3, 2]);
	});

	it("scopes the timeline to a single room", async () => {
		const a = await t.flow.createRoom({ creatorId: "u1" });
		const b = await t.flow.createRoom({ creatorId: "u1" });
		await t.flow.publishEvent({
			roomId: a.id,
			senderId: "u1",
			type: "message.text",
			content: {},
		});
		await t.flow.publishEvent({
			roomId: b.id,
			senderId: "u1",
			type: "message.text",
			content: {},
		});
		expect(await t.flow.getRoomTimeline(a.id)).toHaveLength(1);
	});
});

describe("getSyncStream", () => {
	it("returns events after a token, oldest-first, with a resumable nextToken", async () => {
		const room = await t.flow.createRoom({ creatorId: "u1" });
		for (let i = 0; i < 3; i++) {
			await t.flow.publishEvent({
				roomId: room.id,
				senderId: "u1",
				type: "message.text",
				content: { i },
			});
		}

		const first = await t.flow.getSyncStream({ sinceSequenceId: 0 });
		expect(first.events.map((e) => e.sequenceId)).toEqual([1, 2, 3]);
		expect(first.nextToken).toBe(3);

		// publish more, then resume from the token — only new events come back
		await t.flow.publishEvent({
			roomId: room.id,
			senderId: "u1",
			type: "message.text",
			content: { i: 3 },
		});
		const second = await t.flow.getSyncStream({
			sinceSequenceId: first.nextToken,
		});
		expect(second.events.map((e) => e.sequenceId)).toEqual([4]);
		expect(second.nextToken).toBe(4);
	});

	it("spans all rooms (global stream) and paginates by limit", async () => {
		const a = await t.flow.createRoom({ creatorId: "u1" });
		const b = await t.flow.createRoom({ creatorId: "u1" });
		for (const roomId of [a.id, b.id, a.id, b.id]) {
			await t.flow.publishEvent({
				roomId,
				senderId: "u1",
				type: "message.text",
				content: {},
			});
		}

		const page = await t.flow.getSyncStream({ sinceSequenceId: 0, limit: 3 });
		expect(page.events.map((e) => e.sequenceId)).toEqual([1, 2, 3]);
		expect(page.nextToken).toBe(3);

		const rest = await t.flow.getSyncStream({
			sinceSequenceId: page.nextToken,
		});
		expect(rest.events.map((e) => e.sequenceId)).toEqual([4]);
	});

	it("returns an empty stream with a stable token when nothing is new", async () => {
		const room = await t.flow.createRoom({ creatorId: "u1" });
		await t.flow.publishEvent({
			roomId: room.id,
			senderId: "u1",
			type: "message.text",
			content: {},
		});
		const result = await t.flow.getSyncStream({ sinceSequenceId: 1 });
		expect(result.events).toHaveLength(0);
		expect(result.nextToken).toBe(1);
	});
});

describe("getSyncStream — room scoping (§3.1)", () => {
	it("roomIds filter never returns events from foreign rooms, nextToken advances past them", async () => {
		const a = await t.flow.createRoom({ creatorId: "u1" });
		const b = await t.flow.createRoom({ creatorId: "u1" });
		const c = await t.flow.createRoom({ creatorId: "u1" }); // foreign

		// interleaved: a=1, c=2, b=3, c=4, a=5
		await t.flow.publishEvent({
			roomId: a.id,
			senderId: "u1",
			type: "msg",
			content: {},
		});
		await t.flow.publishEvent({
			roomId: c.id,
			senderId: "u1",
			type: "msg",
			content: {},
		});
		await t.flow.publishEvent({
			roomId: b.id,
			senderId: "u1",
			type: "msg",
			content: {},
		});
		await t.flow.publishEvent({
			roomId: c.id,
			senderId: "u1",
			type: "msg",
			content: {},
		});
		await t.flow.publishEvent({
			roomId: a.id,
			senderId: "u1",
			type: "msg",
			content: {},
		});

		const result = await t.flow.getSyncStream({
			sinceSequenceId: 0,
			roomIds: [a.id, b.id],
		});
		expect(result.events.map((e) => e.roomId)).not.toContain(c.id);
		expect(result.events.map((e) => e.sequenceId)).toEqual([1, 3, 5]);
		// nextToken must advance past C's seq ids (2, 4) so we don't re-scan them
		expect(result.nextToken).toBe(5);
	});

	it("roomIds: [] returns no events and a stable nextToken", async () => {
		const room = await t.flow.createRoom({ creatorId: "u1" });
		await t.flow.publishEvent({
			roomId: room.id,
			senderId: "u1",
			type: "msg",
			content: {},
		});

		const result = await t.flow.getSyncStream({
			sinceSequenceId: 0,
			roomIds: [],
		});
		expect(result.events).toHaveLength(0);
		expect(result.nextToken).toBe(0);
	});

	it("watermark advances past foreign-room gaps on a sparse scope", async () => {
		const a = await t.flow.createRoom({ creatorId: "u1" });
		const foreign = await t.flow.createRoom({ creatorId: "u1" });

		// foreign gets seq 1-5, a gets seq 6
		await publishN(t.flow, foreign.id, 5);
		await t.flow.publishEvent({
			roomId: a.id,
			senderId: "u1",
			type: "msg",
			content: {},
		});

		// page size 3: global page covers seq 1-3; a's event is at 6
		const result = await t.flow.getSyncStream({
			sinceSequenceId: 0,
			roomIds: [a.id],
			limit: 3,
		});
		expect(result.events.map((e) => e.sequenceId)).toEqual([6]);
		// nextToken advances beyond the foreign-only prefix instead of staying at 0.
		expect(result.nextToken).toBeGreaterThanOrEqual(3);
	});

	it("back-compat: omitting roomIds returns the full global stream unchanged", async () => {
		const a = await t.flow.createRoom({ creatorId: "u1" });
		const b = await t.flow.createRoom({ creatorId: "u1" });
		await t.flow.publishEvent({
			roomId: a.id,
			senderId: "u1",
			type: "msg",
			content: {},
		});
		await t.flow.publishEvent({
			roomId: b.id,
			senderId: "u1",
			type: "msg",
			content: {},
		});

		const result = await t.flow.getSyncStream({ sinceSequenceId: 0 });
		expect(result.events.map((e) => e.sequenceId)).toEqual([1, 2]);
		expect(result.nextToken).toBe(2);
	});

	it("resumes correctly across pages with a sparse scope", async () => {
		const a = await t.flow.createRoom({ creatorId: "u1" });
		const foreign = await t.flow.createRoom({ creatorId: "u1" });

		// a=1, foreign=2, a=3, foreign=4, a=5
		await t.flow.publishEvent({
			roomId: a.id,
			senderId: "u1",
			type: "msg",
			content: {},
		});
		await t.flow.publishEvent({
			roomId: foreign.id,
			senderId: "u1",
			type: "msg",
			content: {},
		});
		await t.flow.publishEvent({
			roomId: a.id,
			senderId: "u1",
			type: "msg",
			content: {},
		});
		await t.flow.publishEvent({
			roomId: foreign.id,
			senderId: "u1",
			type: "msg",
			content: {},
		});
		await t.flow.publishEvent({
			roomId: a.id,
			senderId: "u1",
			type: "msg",
			content: {},
		});

		const page1 = await t.flow.getSyncStream({
			sinceSequenceId: 0,
			roomIds: [a.id],
			limit: 2,
		});
		expect(page1.events.map((e) => e.sequenceId)).toEqual([1, 3]);

		const page2 = await t.flow.getSyncStream({
			sinceSequenceId: page1.nextToken,
			roomIds: [a.id],
		});
		expect(page2.events.map((e) => e.sequenceId)).toEqual([5]);
		// confirm no overlap
		const allSeqs = [...page1.events, ...page2.events].map((e) => e.sequenceId);
		expect(new Set(allSeqs).size).toBe(allSeqs.length);
	});
});

describe("publishEvent — integrity (§3.2)", () => {
	it("rejects publish to a nonexistent room without consuming a sequence id", async () => {
		await expect(
			t.flow.publishEvent({
				roomId: "ghost-room",
				senderId: "u1",
				type: "msg",
			}),
		).rejects.toBeInstanceOf(ChatCoreError);
		expect(t.db.event).toHaveLength(0);
		expect(t.db.sequence).toHaveLength(0);
	});

	it("rejects a nonexistent parentEventId without consuming a sequence id", async () => {
		const room = await t.flow.createRoom({ creatorId: "u1" });
		await expect(
			t.flow.publishEvent({
				roomId: room.id,
				senderId: "u1",
				type: "msg",
				parentEventIds: ["does-not-exist"],
			}),
		).rejects.toBeInstanceOf(ChatCoreError);
		expect(t.db.event).toHaveLength(0);
		expect(t.db.sequence).toHaveLength(0);
	});

	it("rejects a cross-room parentEventId", async () => {
		const a = await t.flow.createRoom({ creatorId: "u1" });
		const b = await t.flow.createRoom({ creatorId: "u1" });
		const { event } = await t.flow.publishEvent({
			roomId: a.id,
			senderId: "u1",
			type: "msg",
			content: {},
		});

		await expect(
			t.flow.publishEvent({
				roomId: b.id,
				senderId: "u1",
				type: "msg",
				parentEventIds: [event.id],
			}),
		).rejects.toBeInstanceOf(ChatCoreError);
		// Only the first event should exist; no extra event or sequence consumed
		expect(t.db.event).toHaveLength(1);
	});
});

describe("publishEvent — content size ceiling (§3.3)", () => {
	it("rejects oversized content when maxContentBytes is set", async () => {
		const { flow } = getTestInstance({ maxContentBytes: 10 });
		const room = await flow.createRoom({ creatorId: "u1" });
		await expect(
			flow.publishEvent({
				roomId: room.id,
				senderId: "u1",
				type: "msg",
				content: { body: "this is definitely more than 10 bytes" },
			}),
		).rejects.toBeInstanceOf(ChatCoreError);
	});

	it("allows content within the byte limit", async () => {
		const { flow } = getTestInstance({ maxContentBytes: 1000 });
		const room = await flow.createRoom({ creatorId: "u1" });
		await expect(
			flow.publishEvent({
				roomId: room.id,
				senderId: "u1",
				type: "msg",
				content: { body: "hi" },
			}),
		).resolves.toMatchObject({ sequenceId: 1 });
	});

	it("allows any content size when maxContentBytes is unset", async () => {
		const room = await t.flow.createRoom({ creatorId: "u1" });
		await expect(
			t.flow.publishEvent({
				roomId: room.id,
				senderId: "u1",
				type: "msg",
				content: { body: "x".repeat(100_000) },
			}),
		).resolves.toMatchObject({ sequenceId: 1 });
	});
});

describe("blob storage", () => {
	it("requires blobStorage before blob methods can be used", async () => {
		await expect(
			t.flow.putBlob({
				key: "media/hello.txt",
				data: new Uint8Array([1, 2, 3]),
			}),
		).rejects.toBeInstanceOf(ChatCoreError);
	});

	it("writes, reads, stats, signs, and deletes blobs", async () => {
		const { storage } = createMemoryBlobStorage();
		const { flow } = getTestInstance({ blobStorage: storage });
		const key = "media/room-1/image.png";
		const data = new Uint8Array([137, 80, 78, 71]);

		await flow.putBlob({
			key,
			data,
			contentType: "image/png",
		});

		expect(await flow.getBlob(key)).toEqual(data);
		expect(await flow.getBlobMetadata(key)).toMatchObject({
			size: 4,
			contentType: "image/png",
		});
		await expect(
			flow.createBlobReadUrl({ key, expiresSeconds: 60 }),
		).resolves.toBe("memory://media%2Froom-1%2Fimage.png?expires=60");

		await flow.deleteBlob(key);
		expect(await flow.getBlob(key)).toBeNull();
		expect(await flow.getBlobMetadata(key)).toBeNull();
	});

	it("stores large media out of event content by referencing a blob key", async () => {
		const { storage } = createMemoryBlobStorage();
		const { flow } = getTestInstance({
			blobStorage: storage,
			maxContentBytes: 128,
		});
		const room = await flow.createRoom({ creatorId: "u1" });
		const attachmentKey = "media/room-1/video.mp4";

		await flow.putBlob({
			key: attachmentKey,
			data: new Uint8Array(10_000),
			contentType: "video/mp4",
		});

		await expect(
			flow.publishEvent({
				roomId: room.id,
				senderId: "u1",
				type: "message.media",
				content: {
					attachmentKey,
					contentType: "video/mp4",
				},
			}),
		).resolves.toMatchObject({ sequenceId: 1 });
	});

	it("rejects unsafe blob keys", async () => {
		const { storage } = createMemoryBlobStorage();
		const { flow } = getTestInstance({ blobStorage: storage });

		await expect(
			flow.putBlob({
				key: "../image.png",
				data: new Uint8Array([1]),
			}),
		).rejects.toBeInstanceOf(ChatCoreError);
	});
});
