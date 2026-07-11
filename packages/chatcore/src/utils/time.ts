/** Return the current time as epoch milliseconds. */
export function nowEpochMilliseconds(): number {
	return Temporal.Now.instant().epochMilliseconds;
}
