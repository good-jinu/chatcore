import type {
	ChatCoreStorage,
	ChatCoreStorageRow,
	ChatCoreStorageWhere,
} from "../storage";
import { generateId } from "../utils/id";

/** An in-memory table store keyed by model name. */
export type MemoryDatabase = Record<string, ChatCoreStorageRow[]>;

function matches(
	recordValue: unknown,
	{ value, operator = "eq" }: ChatCoreStorageWhere,
): boolean {
	switch (operator) {
		case "eq":
			return recordValue === value;
		case "ne":
			return recordValue !== value;
		case "lt":
			return (recordValue as number) < (value as number);
		case "lte":
			return (recordValue as number) <= (value as number);
		case "gt":
			return (recordValue as number) > (value as number);
		case "gte":
			return (recordValue as number) >= (value as number);
		case "in":
			return Array.isArray(value) && value.includes(recordValue as never);
		case "contains":
			return String(recordValue).includes(String(value));
		case "starts_with":
			return String(recordValue).startsWith(String(value));
		case "ends_with":
			return String(recordValue).endsWith(String(value));
	}
}

/** Create an in-memory storage backend for tests and local development. */
export function createMemoryStorage(db: MemoryDatabase): ChatCoreStorage {
	const filter = (
		table: ChatCoreStorageRow[],
		where?: ChatCoreStorageWhere[],
	): ChatCoreStorageRow[] =>
		!where || where.length === 0
			? [...table]
			: table.filter((record) =>
					where.every((clause) => matches(record[clause.field], clause)),
				);

	return {
		async create({ model, data }) {
			const row = { id: generateId(), ...data };
			(db[model] ??= []).push(row);
			return row;
		},
		async findOne({ model, where }) {
			return filter(db[model] ?? [], where)[0] ?? null;
		},
		async findMany({ model, where, sortBy, limit, offset }) {
			let rows = filter(db[model] ?? [], where);
			if (sortBy) {
				const direction = sortBy.direction === "asc" ? 1 : -1;
				rows = [...rows].sort((a, b) => {
					const av = a[sortBy.field] as number | string;
					const bv = b[sortBy.field] as number | string;
					return (av > bv ? 1 : av < bv ? -1 : 0) * direction;
				});
			}
			if (offset !== undefined) rows = rows.slice(offset);
			if (limit !== undefined) rows = rows.slice(0, limit);
			return rows;
		},
		async update({ model, where, update }) {
			const matched = filter(db[model] ?? [], where);
			for (const record of matched) Object.assign(record, update);
			return matched[0] ?? null;
		},
		async count({ model, where }) {
			return filter(db[model] ?? [], where).length;
		},
	};
}
