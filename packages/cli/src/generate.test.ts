import { describe, expect, it } from "vitest";
import { generateChatCoreSchema } from "./generate";

describe("generateChatCoreSchema", () => {
	it("generates SQLite DDL for ChatCore tables", async () => {
		const sql = await generateChatCoreSchema({ dialect: "sqlite" });

		expect(sql).toContain('create table "room"');
		expect(sql).toContain('create table "event"');
		expect(sql).toContain(
			'"roomId" text not null references "room" ("id") on delete cascade',
		);
		expect(sql).toContain('"sequenceId" bigint not null unique');
	});

	it("uses native JSON columns for Postgres", async () => {
		const sql = await generateChatCoreSchema({ dialect: "postgres" });

		expect(sql).toContain('"metadata" jsonb not null');
		expect(sql).toContain('"content" jsonb not null');
	});
});
