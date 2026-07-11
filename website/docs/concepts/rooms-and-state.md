---
id: rooms-and-state
title: Rooms, State & Threading
sidebar_position: 2
---

# Rooms, State & Threading

## Rooms

A **room** is an isolated conversation boundary. Every event belongs to exactly
one room. Create one with `createRoom`:

```ts
const room = await flow.createRoom({
  creatorId: "u1",
  metadata: { name: "general" },
});
```

## Room state

While the timeline is the full append-only log of everything that happened, the
**state** of a room is the set of *currently active* state events. State events
are keyed by a `[type, stateKey]` pair — publishing a new event with the same
pair supersedes the previous one.

```ts
// The latest event per [type, stateKey]:
const state = await flow.getRoomState(room.id);
```

This is how mutable-looking concepts (a room's name, topic, or a member's role)
are modelled on top of an immutable log: the "current" name is simply the most
recent `room.state.name` event.

## Threading: the DAG

Events can reference other events through `parentEventIds`, forming a directed
acyclic graph (DAG) of edges. This powers:

- **Replies** — a message points at the message it answers.
- **Edits & reactions** — an event points at the event it modifies.
- **Branching timelines** — multiple events can descend from a shared parent.

```ts
await flow.publishEvent({
  roomId: room.id,
  senderId: "u2",
  type: "message.text",
  content: { body: "replying to you" },
  parentEventIds: [originalEvent.id],
});
```

## Reading the timeline

`getRoomTimeline` returns a room's events newest-first, with optional
pagination:

```ts
const recent = await flow.getRoomTimeline(room.id, {
  limit: 50,
  beforeSequenceId: cursor,
});
```
