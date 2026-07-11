# ChatCore

An in-process, database-agnostic, **event-sourced** messaging engine for
TypeScript. ChatCore provides the core logical engine for chat
applications — the transport layer (HTTP, WebSockets, gRPC) and the storage
engine are left entirely in your hands.

- **Database agnostic** — all persistence is delegated to a small
  `ChatCoreStorage` backend you supply.
- **Immutable event sourcing** — every action in a room (a message, an edit, a
  membership or topic change) is an immutable `FlowEvent`.
- **Trivial real-time sync** — a single, monotonically increasing `sequenceId`
  drives global synchronization.
- **Threaded DAG** — edges between events enable replies and branching timelines.
- **Optional blob storage** — route images, videos, audio, and other large files
  to a separate blob backend while events store stable object keys.

## Install

```bash
pnpm add chatcore
```

## Quick start

```ts
import { getTestInstance } from "chatcore/test";

const { flow } = getTestInstance();

const room = await flow.createRoom({ creatorId: "u1", metadata: { name: "general" } });

await flow.publishEvent({
  roomId: room.id,
  senderId: "u1",
  type: "message.text",
  content: { body: "hello" },
});

// Drive real-time sync from a single global cursor:
const { events, nextToken } = await flow.getSyncStream({ sinceSequenceId: 0 });
```

For production, pass `createChatCore` a storage implementation:

```ts
import { createChatCore } from "chatcore";
import { createChatCoreStorage } from "./storage";

const flow = createChatCore({
  storage: createChatCoreStorage(db),
});
```

Generate starter SQL for ChatCore's storage tables with the separate CLI
package:

```bash
pnpm dlx @chatcore/cli schema generate --dialect sqlite --out migrations/001_chatcore.sql
```

For media and attachments, keep event payloads small and store binary objects
through `blobStorage`. Node applications can use the optional OpenDAL adapter:

```ts
import { createOpenDalBlobStorage } from "chatcore/opendal";
import { Operator } from "opendal";

const flow = createChatCore({
  storage,
  blobStorage: createOpenDalBlobStorage(new Operator("s3", {
    bucket: "chatcore-media",
    region: "us-east-1",
  })),
});

await flow.putBlob({
  key: "rooms/general/image.png",
  data: imageBytes,
  contentType: "image/png",
});

await flow.publishEvent({
  roomId: room.id,
  senderId: "u1",
  type: "message.media",
  content: { attachmentKey: "rooms/general/image.png" },
});
```

## Engine API

| Method | Description |
| --- | --- |
| `createRoom({ creatorId, metadata? })` | Create an isolated conversation boundary. |
| `getRoom(roomId)` | Fetch a room, or `null`. |
| `publishEvent({ roomId, senderId, type, stateKey?, content?, parentEventIds? })` | Append an immutable event; returns `{ event, sequenceId }`. |
| `getRoomState(roomId)` | The active state events (latest per `[type, stateKey]`). |
| `getRoomTimeline(roomId, { limit?, beforeSequenceId? })` | A room's events, newest-first. |
| `getSyncStream({ sinceSequenceId?, limit?, roomIds? })` | Stream of events after a token, oldest-first. Omit `roomIds` for the global stream. |
| `putBlob({ key, data, contentType? })` | Store media/attachment bytes in the configured blob backend. |
| `getBlob(key)` / `getBlobMetadata(key)` / `deleteBlob(key)` | Read, inspect, or delete blob objects. |
| `createBlobReadUrl({ key, expiresSeconds })` | Create a time-limited read URL when the blob backend supports it. |

## Development

This is a pnpm monorepo. The SDK lives in `packages/chatcore`.

```bash
pnpm install
pnpm typecheck
pnpm test
```

See [`AGENTS.md`](./AGENTS.md) for contributor guidelines.

## License

MIT
