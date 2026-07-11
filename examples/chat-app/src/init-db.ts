import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { ensureChatCoreSchema } from "./schema.js";

const projectDir = fileURLToPath(new URL("../", import.meta.url));
const schemaPath = join(projectDir, "schema", "chatcore.sql");
const databasePath =
	process.env.DATABASE_URL ?? join(projectDir, "data", "chatcore.sqlite");

await mkdir(dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
try {
	await ensureChatCoreSchema({ db, databasePath, schemaPath });
	console.log(`ChatCore schema is ready: ${databasePath}`);
} finally {
	db.close();
}
