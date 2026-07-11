# RFC 0001 — Implementation Tasks

Tracks the work to deliver [0001-access-control.md](./0001-access-control.md)
(Scoping Primitives & Integrity, v0.2). Tasks are grouped by RFC section and
ordered roughly by dependency. File paths are relative to
`packages/chatcore/src`.

## 1. Room-scoped sync (§3.1 — headline)

- [x] **Add `roomIds` to `GetSyncStreamOptions`** in `types/index.ts`.
  Optional `string[]`. Document the three cases: omitted → full global stream,
  `[]` → no events, `[...]` → `roomId in (...)` filter.
- [x] **Apply the filter in `getSyncStream`** (`engine/sync.ts`).
  - Add `roomId in (roomIds)` to the `where` clause when `roomIds` is present.
  - Short-circuit to `{ events: [], nextToken: sinceSequenceId ?? 0 }` when
    `roomIds` is `[]`.
  - Confirm the `unadapter` `Where` type supports an `in` operator; if not,
    determine the supported form before implementing. ✓ `in` operator confirmed.
- [x] **Fix watermark / `nextToken` semantics** (`engine/sync.ts`).
  When `roomIds` is set, a parallel global-page query determines the high-water
  mark; `nextToken = max(scanHighWater, matchedHighWater)` so a sparsely-scoped
  reader never re-scans the same global gap. (Resolves Open Question §4.1.)
- [x] **Decide & document scale behavior** for large `roomIds` sets
  (Open Question §4.2). For v0.2: accept `roomId in (...)`; doc note added to
  `GetSyncStreamOptions.roomIds` JSDoc on the high-fan-out per-room-cursor
  follow-up.
- [x] **Decide on `getRoomSync(roomId, { since })` convenience** (Open Question
  §4.3) — deferred. `roomIds: [id]` covers it.

## 2. Publish-time integrity (§3.2)

- [x] **Validate `roomId` exists on publish** (`engine/publish.ts`).
  Checked via `adapter.findOne` before entering the sequencer; throws
  `ChatCoreError` if the room does not resolve.
- [x] **Validate `parentEventIds`** (`engine/publish.ts`).
  For each parent: load it, assert it exists and shares the event's `roomId`;
  reject cross-room and dangling edges with `ChatCoreError`.
- [x] **Confirm rejection consumes no sequence** — both checks run before
  `sequencer.withNextSequence`, so no sequence id is burned on validation
  failure.

## 3. Content size ceiling (§3.3)

- [x] **Add `maxContentBytes?: number`** to `ChatCoreOptions` (`options.ts`).
  Default `undefined` = unbounded. Document that the host owns the number.
- [x] **Thread the option through** to `createPublishMethod`
  (`chatcore.ts` → `engine/publish.ts`).
- [x] **Enforce in `publishEvent`** — when set, reject content whose serialized
  size (`Buffer.byteLength(JSON.stringify(content), 'utf8')`) exceeds the
  ceiling with `ChatCoreError`.

## 4. Invariants to preserve (§3.4)

- [x] No `actorId` / `ctx` parameters added anywhere.
- [x] `senderId` stays an uninterpreted caller string.
- [x] Global `sequenceId` + resume-by-token model unchanged when `roomIds`
  is omitted.

## 5. Tests (§5)

- [x] **Sync scoping**: `roomIds: [A, B]` against an interleaved global stream
  never returns room C; `nextToken` still advances past C's sequence ids.
- [x] **`roomIds: []`** returns no events and a sane `nextToken`.
- [x] **Back-compat**: `getSyncStream()` with no `roomIds` returns the full
  stream; existing suite passes unchanged.
- [x] **Watermark**: sparse scope against a dense stream resumes correctly
  across pages without re-scanning consumed gaps.
- [x] **Integrity — room**: publish to nonexistent room rejected; no
  `sequenceId` consumed.
- [x] **Integrity — parents**: `parentEventIds` pointing at a foreign-room or
  nonexistent event rejected; no `sequenceId` consumed.
- [x] **Content limit**: oversized content rejected when `maxContentBytes`
  set; allowed when unset.

## 6. Docs & release

- [ ] Update `website` docs for `roomIds`, `maxContentBytes`, and the new
  publish-time integrity guarantees.
- [ ] Changelog / version bump to `0.2.0`; note breaking changes (pre-1.0).
