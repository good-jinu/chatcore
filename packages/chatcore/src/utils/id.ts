/**
 * Generate a random UUIDv4. Uses the Web Crypto API available on Node.js,
 * Bun, Deno, and Cloudflare Workers.
 */
export function generateId(): string {
	return globalThis.crypto.randomUUID();
}
