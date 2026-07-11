/** Primitive values supported in ChatCore storage filters. */
export type ChatCoreStorageValue =
	| string
	| number
	| boolean
	| string[]
	| number[]
	| Temporal.Instant
	| Temporal.PlainDate
	| Temporal.ZonedDateTime
	| null;

/** Query operators supported by ChatCore storage implementations. */
export type ChatCoreStorageOperator =
	| "eq"
	| "ne"
	| "lt"
	| "lte"
	| "gt"
	| "gte"
	| "in"
	| "contains"
	| "starts_with"
	| "ends_with";

/** A single storage-layer filter predicate. */
export interface ChatCoreStorageWhere {
	field: string;
	value: ChatCoreStorageValue;
	operator?: ChatCoreStorageOperator;
	connector?: "AND" | "OR";
}

/** A raw storage row, before/after domain mapping. */
export type ChatCoreStorageRow = Record<string, unknown>;

/** The narrow CRUD/query surface ChatCore needs from a storage backend. */
export interface ChatCoreStorage {
	create(args: {
		model: string;
		data: ChatCoreStorageRow;
	}): Promise<ChatCoreStorageRow>;
	findOne(args: {
		model: string;
		where: ChatCoreStorageWhere[];
	}): Promise<ChatCoreStorageRow | null>;
	findMany(args: {
		model: string;
		where?: ChatCoreStorageWhere[];
		sortBy?: { field: string; direction: "asc" | "desc" };
		limit?: number;
		offset?: number;
	}): Promise<ChatCoreStorageRow[]>;
	update(args: {
		model: string;
		where: ChatCoreStorageWhere[];
		update: ChatCoreStorageRow;
	}): Promise<ChatCoreStorageRow | null>;
	count(args: {
		model: string;
		where?: ChatCoreStorageWhere[];
	}): Promise<number>;
}
