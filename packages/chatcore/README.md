# chatcore

An in-process, database-agnostic, event-sourced messaging engine for TypeScript.

```bash
pnpm add chatcore
```

```ts
import { getTestInstance } from "chatcore/test";

const { flow } = getTestInstance();

const room = await flow.createRoom({ creatorId: "u1" });
await flow.publishEvent({
  roomId: room.id,
  senderId: "u1",
  type: "message.text",
  content: { body: "hello" },
});
const { events, nextToken } = await flow.getSyncStream({ sinceSequenceId: 0 });
```

## Data model

- **`FlowEvent`** — the atomic, immutable unit of state. Carries the
  monotonically increasing `sequenceId`.
- **`Room`** — an isolated conversation boundary.
- **`EventEdge`** — a parent → child link between events (threading / DAG).
- **Room state projection** — a cache keyed by `[roomId, type, stateKey]`
  pointing at the latest state event, so current state is read without replaying
  the whole timeline.

## Choosing a database

ChatCore persists through a storage backend passed as `options.storage`.
The application owns the database integration:

```ts
import { createChatCore } from "chatcore";
import { createChatCoreStorage } from "./storage";

const flow = createChatCore({
  storage: createChatCoreStorage(db),
});
```

You can also provide a custom implementation of ChatCore's `ChatCoreStorage`
interface.

**Sequencing & atomicity.** ChatCore's current storage layer exposes no
cross-statement transaction primitive, so `publishEvent` is serialized
in-process to keep `sequenceId` strictly increasing. Integrity checks run before
sequence assignment, but storage failures during the serialized write can still
advance the stored counter. For multi-process deployments, back ChatCore with a
storage implementation that provides its own atomic ordering.

**Testing.** For tests, use the included corrected in-memory helper:

```ts
import { getTestInstance } from "chatcore/test";

const { flow, db } = getTestInstance();
```

## Media and attachments

ChatCore keeps event storage and blob storage separate. Store images, video,
audio, exports, and other large payloads in `blobStorage`, then put the object
key in event content:

```ts
await flow.putBlob({
  key: "rooms/general/photo.png",
  data: imageBytes,
  contentType: "image/png",
});

await flow.publishEvent({
  roomId,
  senderId: "u1",
  type: "message.media",
  content: {
    attachmentKey: "rooms/general/photo.png",
    contentType: "image/png",
  },
});
```

Node applications can use ChatCore's OpenDAL adapter for S3, GCS, Azure Blob,
local filesystem, memory, and other services:

```ts
import { createOpenDalBlobStorage } from "chatcore/opendal";
import { Operator } from "opendal";

const flow = createChatCore({
  storage,
  blobStorage: createOpenDalBlobStorage(new Operator("memory")),
});
```

## Provisioning the schema

ChatCore stores five tables — `room`, `event`, `eventEdge`, `roomState`,
`sequence`. How you create them depends on the adapter:

For SQL databases, the separate CLI package can generate starter DDL without
adding CLI-only dependencies to the runtime `chatcore` package:

```bash
pnpm dlx @chatcore/cli schema generate --dialect sqlite --out migrations/001_chatcore.sql
```

| Adapter | What you do |
| --- | --- |
| **Kysely** | Create the five tables with your migration tool or host-app bootstrapping code, then implement `ChatCoreStorage` with normal Kysely queries. |
| **Drizzle** | Define the tables in your Drizzle schema (below), then manage migrations with `drizzle-kit`. |
| **Prisma** | Add the models below to `schema.prisma`, then run `prisma migrate` / `prisma db push`. |

### Logical column types

`ChatCoreStorage` receives and returns logical JavaScript values. Your adapter
may store these as native JSON columns, serialized strings, `bigint`, or other
database-specific types, but it should map them back to the values shown here:

| chatcore field(s) | Storage type | SQL / Prisma type | Why |
| --- | --- | --- | --- |
| `createdAt`, `timestamp`, `sequenceId`, `value` | `number` | **`BigInt`** or integer | epoch-millis / counters, not `DateTime` |
| `metadata`, `content` | JSON object | **`Json`** or serialized string | adapters must return a plain JSON object |

### Prisma

Model names are PascalCase so Prisma's lowercased client accessors
(`prisma.room`, `prisma.eventEdge`, …) match the names ChatCore queries. The
back-relations are required for Prisma to validate the `onDelete: Cascade`
foreign keys.

```prisma
model Room {
  id        String @id
  creatorId String
  createdAt BigInt
  metadata  String

  events Event[]
  states RoomState[]
}

model Event {
  id         String  @id
  roomId     String
  senderId   String
  type       String
  stateKey   String?
  content    String
  timestamp  BigInt
  sequenceId BigInt  @unique

  room   Room        @relation(fields: [roomId], references: [id], onDelete: Cascade)
  edges  EventEdge[]
  states RoomState[]
}

model EventEdge {
  id            String @id
  eventId       String
  parentEventId String

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
}

model RoomState {
  id        String @id
  roomId    String
  eventType String
  stateKey  String
  eventId   String

  room  Room  @relation(fields: [roomId], references: [id], onDelete: Cascade)
  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
}

model Sequence {
  id    String @id
  name  String @unique
  value BigInt
}
```

The storage implementation creates row `id`s when ChatCore calls `create`, so
the columns intentionally have no database default in this example.

### Drizzle (Postgres)

```ts
import { bigint, pgTable, text } from "drizzle-orm/pg-core";

export const room = pgTable("room", {
  id: text("id").primaryKey(),
  creatorId: text("creatorId").notNull(),
  createdAt: bigint("createdAt", { mode: "bigint" }).notNull(),
  metadata: text("metadata").notNull(),
});

export const event = pgTable("event", {
  id: text("id").primaryKey(),
  roomId: text("roomId")
    .notNull()
    .references(() => room.id, { onDelete: "cascade" }),
  senderId: text("senderId").notNull(),
  type: text("type").notNull(),
  stateKey: text("stateKey"),
  content: text("content").notNull(),
  timestamp: bigint("timestamp", { mode: "bigint" }).notNull(),
  sequenceId: bigint("sequenceId", { mode: "bigint" }).notNull().unique(),
});

export const eventEdge = pgTable("eventEdge", {
  id: text("id").primaryKey(),
  eventId: text("eventId")
    .notNull()
    .references(() => event.id, { onDelete: "cascade" }),
  parentEventId: text("parentEventId").notNull(),
});

export const roomState = pgTable("roomState", {
  id: text("id").primaryKey(),
  roomId: text("roomId")
    .notNull()
    .references(() => room.id, { onDelete: "cascade" }),
  eventType: text("eventType").notNull(),
  stateKey: text("stateKey").notNull(),
  eventId: text("eventId")
    .notNull()
    .references(() => event.id, { onDelete: "cascade" }),
});

export const sequence = pgTable("sequence", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  value: bigint("value", { mode: "bigint" }).notNull(),
});
```

Use these examples as a starting point for migrations, then make the adapter
perform any serialization or `bigint`/`number` conversion needed by your
database client.

## License

MIT
