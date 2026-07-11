import { readFile } from "node:fs/promises";
import type Database from "better-sqlite3";

const CHATCORE_TABLES = ["room", "event", "eventEdge", "roomState", "sequence"];

export interface EnsureChatCoreSchemaOptions {
	db: Database.Database;
	databasePath: string;
	schemaPath: string;
}

export async function ensureChatCoreSchema({
	db,
	databasePath,
	schemaPath,
}: EnsureChatCoreSchemaOptions): Promise<void> {
	db.pragma("foreign_keys = ON");

	const existingTables = getExistingChatCoreTables(db);
	if (existingTables.size === CHATCORE_TABLES.length) return;

	if (existingTables.size > 0) {
		throw new Error(
			`ChatCore schema is partially initialized in ${databasePath}. Delete the database or apply a migration before starting the example.`,
		);
	}

	const schemaSql = await readFile(schemaPath, "utf8");
	db.exec(schemaSql);
}

function getExistingChatCoreTables(db: Database.Database): Set<string> {
	const placeholders = CHATCORE_TABLES.map(() => "?").join(", ");
	const rows = db
		.prepare(
			`select name from sqlite_master where type = 'table' and name in (${placeholders})`,
		)
		.all(...CHATCORE_TABLES) as { name: string }[];
	return new Set(rows.map((row) => row.name));
}
