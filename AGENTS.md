# ChatCore Development Guide

This is the ChatCore repository — an in-process, database-agnostic,
event-sourced messaging engine for TypeScript. It provides the core logical
engine for chat applications, leaving the transport layer (HTTP, WebSockets,
gRPC) and the storage engine to the integrating developer.

## Project Structure

- `packages/chatcore` — the SDK (`chatcore`)
  - `src/types` — domain types (`FlowEvent`, `Room`, `EventEdge`, sync types)
  - `src/db` — `unadapter` schema (`tables.ts`), adapter wrapper (`adapter.ts`),
    monotonic sequence assignment (`sequence.ts`)
  - `src/engine` — pipelines: `rooms`, `publish`, `state`, `timeline`, `sync`
  - `src/test-utils` — `getTestInstance()` + a corrected in-memory adapter

## Database layer

- Storage is delegated to [`unadapter`](https://www.npmjs.com/package/unadapter).
  The engine defines its schema with `createTable` and builds a CRUD adapter via
  `createAdapter(tables, { database })`; the developer plugs in any unadapter
  backend (`unadapter/memory`, `unadapter/drizzle`, `unadapter/kysely`, …).
- unadapter exposes no transaction primitive, so `publishEvent` is serialized
  in-process to keep `sequenceId` strictly increasing (see `src/db/sequence.ts`).
- unadapter's bundled `unadapter/memory` adapter treats range operators
  (`gt`/`lt`/…) as `eq`. Tests use the corrected adapter in
  `src/test-utils/memory-adapter.ts` instead.

## Commands

- ALWAYS use `pnpm` (never npm, yarn, or bun)
- Run a single test: `vitest path/to/test -t <pattern>` (from the package dir)
- Type check: `pnpm typecheck`
- Formatting/linting runs automatically on commit via the `mise` pre-commit task.

## Writing Code

- Must work across Node.js, Bun, Deno, and Cloudflare Workers. Avoid runtime-specific APIs.
- Biome (tabs for code, 2 spaces for JSON)
- NEVER use `any`. NEVER use classes.
- Use `Uint8Array` instead of `Buffer` (except in tests)
- Import zod as `import * as z from "zod"`
- Use `import type` for type-only imports
- Use `node:` protocol for Node.js built-ins (e.g. `node:crypto`)
- JSDoc comments for public APIs

## Testing

- Tests use Vitest. Use `getTestInstance()` from `chatcore/test`; it
  returns `{ flow, db }` backed by the in-memory adapter.
- Regression tests: add `@see` comment with the issue URL above `it()`/`describe()`.

## Important Development Notes

- Bug fixes and new features MUST include tests
- For bug fixes: if the issue is reproducible in a test, write a failing test first, then implement the fix
- Ensure `pnpm typecheck` passes before finishing
- DO NOT COMMIT unless the user explicitly asks
- Conventional Commits: `feat(scope):`, `fix(scope):`, `docs:`, `chore:`. Use `!` for breaking changes
- PRs target `main`
