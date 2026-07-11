# @chatcore/cli

Command-line tools for ChatCore.

The CLI is shipped separately from the runtime `chatcore` package so application
code does not install CLI-only dependencies. Internally, this package uses
`unadapter` to generate database schema SQL from ChatCore's canonical storage
schema.

## Usage

Generate starter SQL for ChatCore's storage tables:

```bash
pnpm dlx @chatcore/cli schema generate --dialect sqlite --out migrations/001_chatcore.sql
```

Print SQL to stdout:

```bash
pnpm dlx @chatcore/cli schema generate --dialect postgres
```

## Commands

### `schema generate`

```bash
chatcore schema generate --dialect <sqlite|postgres|mysql> [--out <file>]
```

Options:

| Option | Description |
| --- | --- |
| `--dialect` | Required. SQL dialect to generate: `sqlite`, `postgres`, or `mysql`. |
| `--out` | Optional. Write SQL to a file instead of stdout. Parent directories are created automatically. |
| `--id-strategy` | Optional. Primary-key strategy: `string`, `uuid`, `serial`, or `number`. Defaults to `string`. |

## Examples

SQLite:

```bash
pnpm dlx @chatcore/cli schema generate --dialect sqlite --out migrations/001_chatcore.sql
```

Postgres with database-generated UUID ids:

```bash
pnpm dlx @chatcore/cli schema generate --dialect postgres --id-strategy uuid
```

MySQL:

```bash
pnpm dlx @chatcore/cli schema generate --dialect mysql
```

## Scope

The generated SQL creates ChatCore's five storage tables:

- `room`
- `event`
- `eventEdge`
- `roomState`
- `sequence`

This CLI only generates schema DDL. Your application still owns the
`ChatCoreStorage` implementation, including JSON serialization, row decoding,
query translation, and any database-specific atomicity requirements.
