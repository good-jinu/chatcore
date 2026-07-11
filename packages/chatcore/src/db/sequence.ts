import type { FlowAdapter } from "./adapter";

const SEQUENCE_NAME = "global";

/**
 * Assigns strictly-increasing `sequenceId` values for the event timeline.
 *
 * ChatCoreStorage exposes no cross-statement transaction primitive, so
 * monotonicity is guaranteed *within a single process* by serializing assignment
 * through an in-memory promise queue: each call waits for the previous one to
 * finish its full task before reading and incrementing the counter. Deployments
 * that publish from multiple processes must back ChatCore with a storage
 * implementation that provides its own atomic ordering.
 */
export function createSequencer(adapter: FlowAdapter) {
	let tail: Promise<unknown> = Promise.resolve();

	async function bump(): Promise<number> {
		const current = await adapter.findOne({
			model: "sequence",
			where: [{ field: "name", value: SEQUENCE_NAME }],
		});

		if (!current) {
			await adapter.create({
				model: "sequence",
				data: { name: SEQUENCE_NAME, value: 1 },
			});
			return 1;
		}

		const next = Number(current.value) + 1;
		await adapter.update({
			model: "sequence",
			where: [{ field: "name", value: SEQUENCE_NAME }],
			update: { value: next },
		});
		return next;
	}

	/**
	 * Run `task` with the next sequence id, fully serialized against every other
	 * call so the counter is never read concurrently.
	 */
	function withNextSequence<T>(
		task: (sequenceId: number) => Promise<T>,
	): Promise<T> {
		const run = tail.then(async () => {
			const sequenceId = await bump();
			return task(sequenceId);
		});
		// Keep the queue alive regardless of whether this task resolves or rejects.
		tail = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	}

	return { withNextSequence };
}

export type Sequencer = ReturnType<typeof createSequencer>;
