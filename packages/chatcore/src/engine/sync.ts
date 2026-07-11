import type { FlowAdapter } from "../db/adapter";
import { toEvent } from "../db/rows";
import type { ChatCoreStorageWhere } from "../storage";
import type { GetSyncStreamOptions, SyncStreamResult } from "../types";

/** Global synchronization stream. */
export function createSyncMethods(adapter: FlowAdapter, defaultLimit: number) {
	/**
	 * Return events published after `sinceSequenceId`, oldest-first, plus a
	 * `nextToken` to resume from.
	 *
	 * When `roomIds` is provided, returned events are scoped to those rooms. A
	 * separate global page is read to advance `nextToken` across out-of-scope
	 * sequence gaps, so sparse scopes do not re-scan the same gap forever.
	 */
	async function getSyncStream({
		sinceSequenceId,
		limit,
		roomIds,
	}: GetSyncStreamOptions = {}): Promise<SyncStreamResult> {
		const since = sinceSequenceId ?? 0;
		const effectiveLimit = limit ?? defaultLimit;

		// Caller explicitly passed an empty set → no events.
		if (roomIds !== undefined && roomIds.length === 0) {
			return { events: [], nextToken: since };
		}

		const baseWhere: ChatCoreStorageWhere[] =
			since > 0 ? [{ field: "sequenceId", value: since, operator: "gt" }] : [];

		if (roomIds !== undefined) {
			// Scoped stream: DB-level roomId filter plus a global page boundary
			// read for the resume token.
			const scopedWhere: ChatCoreStorageWhere[] = [
				...baseWhere,
				{ field: "roomId", value: roomIds, operator: "in" },
			];

			const [matchedRows, scanRows] = await Promise.all([
				adapter.findMany({
					model: "event",
					where: scopedWhere,
					sortBy: { field: "sequenceId", direction: "asc" },
					limit: effectiveLimit,
				}),
				// Fetch the global page boundary so nextToken advances past
				// foreign-room gaps even when no in-scope events fill the page.
				adapter.findMany({
					model: "event",
					where: baseWhere,
					sortBy: { field: "sequenceId", direction: "asc" },
					limit: effectiveLimit,
				}),
			]);

			const events = matchedRows.map(toEvent);
			const scanHighWater =
				scanRows.length > 0
					? toEvent(scanRows[scanRows.length - 1]!).sequenceId
					: since;
			const matchedHighWater =
				events.length > 0 ? events[events.length - 1]!.sequenceId : since;
			const nextToken = Math.max(scanHighWater, matchedHighWater);

			return { events, nextToken };
		}

		// Global stream: no roomIds filter.
		const rows = await adapter.findMany({
			model: "event",
			where: baseWhere,
			sortBy: { field: "sequenceId", direction: "asc" },
			limit: effectiveLimit,
		});

		const events = rows.map(toEvent);
		const nextToken =
			events.length > 0 ? events[events.length - 1]!.sequenceId : since;

		return { events, nextToken };
	}

	return { getSyncStream };
}
