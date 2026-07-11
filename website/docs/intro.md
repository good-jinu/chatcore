---
id: intro
title: Introduction
sidebar_position: 1
slug: /
---

# ChatCore

**ChatCore** is an in-process, database-agnostic, **event-sourced** messaging
engine for TypeScript. It provides the core logical engine for chat
applications — the transport layer (HTTP, WebSockets, gRPC) and the storage
engine are left entirely in your hands.

## Why ChatCore

- **Database agnostic** — all persistence is delegated to a ChatCore storage
  backend you supply.
- **Immutable event sourcing** — every action in a room (a message, an edit, a
  membership or topic change) is an immutable `FlowEvent`.
- **Trivial real-time sync** — a single, monotonically increasing `sequenceId`
  drives global synchronization.
- **Threaded DAG** — edges between events enable replies and branching
  timelines.

## How it fits together

ChatCore is just the engine. You bring:

1. **A database** — implement the ChatCore storage interface with Kysely,
   Drizzle, Prisma, raw SQL, or your own persistence layer.
2. **A transport** — expose the engine's methods over HTTP, WebSockets, gRPC,
   or anything else.

The engine handles the hard parts: immutable event storage, room state
reduction, threaded timelines, and a single global cursor for real-time sync.

Continue to **[Getting Started](./getting-started.md)** to install ChatCore and
publish your first event, or jump straight to the
**[API Reference](./api/index.md)**.
