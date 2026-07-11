# RFC 0001 — Scoping Primitives & Integrity (v0.2)

- **Status:** Draft
- **Target version:** 0.2.0
- **Breaking changes:** Yes (pre-1.0), but additive where possible

## 0. Framing: ChatCore is mechanism, not policy

ChatCore is an **embeddable** chat engine. It runs *inside* the host's server
(any framework) and the host *already* has authentication and authorization.
The library must therefore:

- **NOT** own identity — no `actorId`, no `AuthContext`, no claims.
- **NOT** ship a permission/membership/role model.
- **NOT** call an "authorizer" hook. Policy is the host's.

The host authenticates the request, decides what the user may see/do, and then
calls ChatCore. ChatCore's responsibility is to **give the host the primitives
to enforce that decision** — and to keep its own data internally consistent.

This RFC supersedes the earlier authorizer-hook draft, which pushed policy into
the library and was the wrong altitude.

## 1. Problem statement

### 1.1 No room-scoping primitive for sync (the real gap)

`getSyncStream` is driven by a single global `sequenceId` cursor and can only
return **the entire global stream** — there is no `roomId` filter:

```ts
// src/engine/sync.ts — global, unscopable
const rows = await adapter.findMany({
  model: "event",
  where: since > 0 ? [{ field: "sequenceId", operator: "gt", value: since }] : [],
  sortBy: { field: "sequenceId", direction: "asc" },
  limit,
});
```

Consequence: a host that wants to drive real-time updates for *the rooms a user
belongs to* cannot. Its only option is to pull every room's events and filter in
app code — which still reads foreign rooms' message bodies, senders, and
metadata out of the database. The library gives the host no way to do the right
thing efficiently. **This is the headline item for v0.2.**

This is not the library failing to *authorize* — authorization is the host's.
It is the library failing to provide the *mechanism* the host needs.

### 1.2 Internal integrity holes (the library's own job)

Independent of auth, the engine can be driven into an inconsistent state:

- `publishEvent` never checks that `roomId` exists → orphan events with a live
  `sequenceId`.
- `parentEventIds` are written as edges with no validation that the parents
  exist or share the same `roomId` → cross-room / dangling DAG edges.
- `content` is unbounded → storage-bloat vector. The host should be able to set
  a ceiling.

These are correctness guarantees the library owes every host regardless of how
they do auth.

## 2. Goals / non-goals

**Goals**
- Room-scoped sync: let the host pass the set of rooms a request may observe.
- Keep the global monotonic cursor and its simple resume semantics.
- Validate room existence and `parentEventIds` on publish.
- Optional, host-configured `maxContentBytes`.

**Non-goals**
- Identity, authentication, authorization, roles, membership. (A host models
  membership however it likes and passes the resulting room ids in.)
- Any per-call policy hook.
- Multi-process sequencer atomicity (tracked separately).

## 3. Design

### 3.1 Room-scoped sync (primary)

Add an optional `roomIds` filter to `getSyncStream`. The host resolves "which
rooms may this request see" from its own auth and passes them in:

```ts
interface GetSyncStreamOptions {
  sinceSequenceId?: number;
  limit?: number;
  /**
   * Restrict the stream to these rooms. Omit for the full global stream
   * (single-tenant embeds, or a trusted/system reader). When present, the
   * roomId filter is applied in the database query — foreign rooms are never
   * read.
   */
  roomIds?: string[];
}
```

- Omitted → today's global behavior (back-compat for single-tenant embeds).
- `[]` → returns no events.
- `[...]` → query gains `roomId in (...)`; foreign rooms never leave the DB.

**Watermark:** `nextToken` must advance on the global sequence position
*scanned*, not on the last *returned* (matching) event — otherwise an actor
visible in few rooms re-scans the same global gap forever. Implementation will
track the high-water mark of rows examined within the page. (Open question 4.1.)

### 3.2 Publish-time integrity

Inside the sequencer-serialized publish path:

- Confirm `roomId` resolves to an existing room; else throw `ChatCoreError`.
- For each `parentEventId`: load it, assert it exists and shares the event's
  `roomId`; else reject. Prevents cross-room and dangling edges.

### 3.3 Content size ceiling (opt-in)

`ChatCoreOptions.maxContentBytes?: number`. When set, `publishEvent` rejects
content whose serialized size exceeds it with a `ChatCoreError`. Default
`undefined` = unbounded (today's behavior). The host owns the number.

### 3.4 What stays exactly the same

- No `actorId` / `ctx` parameters anywhere.
- `senderId` remains a plain caller-supplied string; the library does not
  interpret or trust it for access decisions (it has none to make).
- The global `sequenceId` and resume-by-token model are unchanged.

## 4. Open questions

1. **Watermark semantics** — confirm scanned-vs-returned cursor survives
   pagination edge cases when `roomIds` is sparse against a dense global stream.
2. **Scale** — `roomId in (...)` with a large room set: acceptable for v0.2, or
   do we document a per-room-cursor follow-up for high-fan-out actors?
3. **Per-room sync** — do we also want `getRoomSync(roomId, { since })` as a
   convenience for the common single-room subscription, or is the `roomIds`
   filter enough?

## 5. Test plan

- Sync scoping: `roomIds: [A,B]` against an interleaved global stream never
  returns room C; `nextToken` still advances past C's sequence ids.
- Back-compat: `getSyncStream()` with no `roomIds` returns the full stream and
  passes the existing suite unchanged.
- Integrity: publish to nonexistent room rejected; `parentEventIds` pointing at
  a foreign-room or nonexistent event rejected; no `sequenceId` consumed on
  rejection.
- Content limit: oversized content rejected when `maxContentBytes` set; allowed
  when unset.
