---
id: sync
title: Real-time Sync
sidebar_position: 3
---

# Real-time Sync

ChatCore makes real-time synchronization trivial with a single, globally
**monotonically increasing `sequenceId`**. Every published event — across every
room — is assigned the next number in this global sequence.

## A single global cursor

Because the sequence is global and strictly increasing, a client only needs to
remember **one number**: the `sequenceId` of the last event it has seen. To
catch up, it asks for everything after that cursor:

```ts
let cursor = 0;

const { events, nextToken } = await flow.getSyncStream({
  sinceSequenceId: cursor,
  limit: 100,
});

// Apply `events` (oldest-first), then advance the cursor:
cursor = nextToken;
```

Poll `getSyncStream` on an interval, or trigger it from your own
push/WebSocket layer — ChatCore is transport-agnostic, so *how* you deliver the
stream to clients is up to you.

## How the sequence stays monotonic

ChatCore's storage contract exposes no transaction primitive, so ChatCore
serializes `publishEvent` in-process to keep concurrent publishes from racing
inside one engine instance. Integrity checks run before sequence assignment, but
storage failures during a serialized write can still advance the stored counter.
For multi-process publishers or stronger atomicity guarantees, use a storage
implementation that provides atomic ordering.

:::tip
Persist the cursor per-client. On reconnect, replay from the stored
`sequenceId` and the client is fully caught up — no per-room bookkeeping
required.
:::
