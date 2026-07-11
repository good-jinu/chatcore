import { Kysely, MysqlDialect, PostgresDialect, SqliteDialect } from "kysely";
import { generate } from "unadapter/generate";
import { kyselyAdapter } from "unadapter/kysely";
import { getChatCoreTables } from "./schema";

export type ChatCoreSchemaDialect = "mysql" | "postgres" | "sqlite";

export type ChatCoreSchemaIdStrategy = "number" | "serial" | "string" | "uuid";

export interface GenerateChatCoreSchemaOptions {
	dialect: ChatCoreSchemaDialect;
	/**
	 * Primary-key strategy for the generated `id` columns.
	 *
	 * @default "string"
	 */
	idStrategy?: ChatCoreSchemaIdStrategy;
}

type EmptyDatabase = Record<string, never>;

interface AdvancedDatabaseOptions {
	generateId?: "serial" | "uuid";
	useNumberId?: true;
}

/** Generate SQL DDL for ChatCore's storage tables. */
export async function generateChatCoreSchema(
	options: GenerateChatCoreSchemaOptions,
): Promise<string> {
	const db = createDriverlessKysely(options.dialect);
	const adapter = kyselyAdapter(db, { type: options.dialect });
	const sql = await generate(
		getChatCoreTables,
		{
			database: adapter,
			advanced: {
				database: toAdvancedDatabaseOptions(options.idStrategy ?? "string"),
			},
		},
		{ format: "sql" },
	);
	return applyChatCoreForeignKeyCascades(sql, options.dialect);
}

function createDriverlessKysely(
	dialect: ChatCoreSchemaDialect,
): Kysely<EmptyDatabase> {
	if (dialect === "postgres") {
		return new Kysely<EmptyDatabase>({
			dialect: new PostgresDialect({
				pool: {},
			} as ConstructorParameters<typeof PostgresDialect>[0]),
		});
	}

	if (dialect === "mysql") {
		return new Kysely<EmptyDatabase>({
			dialect: new MysqlDialect({
				pool: {},
			} as ConstructorParameters<typeof MysqlDialect>[0]),
		});
	}

	return new Kysely<EmptyDatabase>({
		dialect: new SqliteDialect({
			database: {},
		} as ConstructorParameters<typeof SqliteDialect>[0]),
	});
}

function toAdvancedDatabaseOptions(
	idStrategy: ChatCoreSchemaIdStrategy,
): AdvancedDatabaseOptions {
	if (idStrategy === "uuid" || idStrategy === "serial") {
		return { generateId: idStrategy };
	}
	if (idStrategy === "number") return { useNumberId: true };
	return {};
}

function applyChatCoreForeignKeyCascades(
	sql: string,
	dialect: ChatCoreSchemaDialect,
): string {
	const quotedReferences =
		dialect === "mysql"
			? [
					/references `room` \(`id`\)(?! on delete)/g,
					/references `event` \(`id`\)(?! on delete)/g,
				]
			: [
					/references "room" \("id"\)(?! on delete)/g,
					/references "event" \("id"\)(?! on delete)/g,
				];

	return quotedReferences.reduce(
		(current, referencePattern) =>
			current.replace(referencePattern, (reference) => {
				return `${reference} on delete cascade`;
			}),
		sql,
	);
}
