---
id: getting-started
title: Getting Started
sidebar_position: 2
---

# Getting Started

## Install

```bash
pnpm add chatcore
```

## Quick start

```ts
import { getTestInstance } from "chatcore/test";

const { flow } = getTestInstance();

const room = await flow.createRoom({
  creatorId: "u1",
  metadata: { name: "general" },
});

await flow.publishEvent({
  roomId: room.id,
  senderId: "u1",
  type: "message.text",
  content: { body: "hello" },
});

// Drive real-time sync from a single global cursor:
const { events, nextToken } = await flow.getSyncStream({ sinceSequenceId: 0 });
```

:::note Production storage
For production, pass `createChatCore` a storage backend. Apps implement
ChatCore's `ChatCoreStorage` interface with their database library of choice.
:::

## Testing helper

```ts
import { getTestInstance } from "chatcore/test";

const { flow, db } = getTestInstance();
// `flow` is a ChatCore engine, `db` is the raw in-memory store for assertions.
```

## Engine API at a glance

| Method | Description |
| --- | --- |
| `createRoom({ creatorId, metadata? })` | Create an isolated conversation boundary. |
| `getRoom(roomId)` | Fetch a room, or `null`. |
| `listRooms({ limit?, order? })` | List rooms by creation time. |
| `publishEvent({ roomId, senderId, type, stateKey?, content?, parentEventIds? })` | Append an immutable event; returns `{ event, sequenceId }`. |
| `getRoomState(roomId)` | The active state events (latest per `[type, stateKey]`). |
| `getRoomTimeline(roomId, { limit?, beforeSequenceId? })` | A room's events, newest-first. |
| `getSyncStream({ sinceSequenceId?, limit? })` | Global stream of events after a token, oldest-first. |

See the full **[API Reference](./api/index.md)** for every type and signature.
