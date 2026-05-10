# TASK-2: Extend `PublishedForm` record schema

## Status
Not started

## Phase
Phase 1 — Storage Foundation

## Priority
P0

## Description
Extend the `PublishedForm` record stored in Redis to support: an explicit `expiresAt` timestamp (so the UI can render an authoritative expiry date), an `extended` boolean flag (so the extend endpoint can enforce one-time semantics without TTL math), and a list of image blob keys belonging to the form (so the sweeper can correlate forms ↔ blobs).

## Requirements
- `PublishedForm` type gains:
  - `expiresAt: string` — ISO timestamp when the form will expire.
  - `extended: boolean` — `false` on initial publish, `true` after a successful 1-year extension.
  - `imageKeys: string[]` — Vercel Blob keys (or full URLs, see Technical Notes) for images embedded in this form. Empty array if none.
- `save(id, record)` writes `expiresAt` derived from `Date.now() + TTL_SECONDS * 1000`. Continues to set Redis TTL via `{ ex: TTL_SECONDS }`.
- `get(id)` returns the extended shape. Records written before this task lack the new fields and must be tolerated:
  - Missing `expiresAt` → derive from Redis TTL on read (best effort) or return `null` and let callers fall back to "Expires soon".
  - Missing `extended` → treat as `false`.
  - Missing `imageKeys` → treat as `[]`. Sweeper must not attempt cleanup for these legacy records (see TASK-7 risk row).
- Continue to JSON-encode the record as a single Redis string value (no schema migration to hashes).

## Acceptance Criteria
- [ ] `PublishedForm` type in `app/lib/store.ts` includes `expiresAt`, `extended`, `imageKeys`.
- [ ] `save(id, record)` populates `expiresAt` automatically; callers do not need to compute it.
- [ ] `get(id)` returns a record with all three new fields, falling back to safe defaults for legacy values.
- [ ] Existing reads of pre-feature records do not throw or return malformed data.
- [ ] Unit-style verification (or a one-off script) shows: publish → `get` returns `extended: false`, `imageKeys: []`, `expiresAt` ~30 days out.

## Technical Notes
- File: `app/lib/store.ts`. The schema lives at the top of the file alongside `TTL_SECONDS`.
- Decision: store `imageKeys` (the Vercel Blob path/key), not full public URLs. Reason: the sweeper deletes by key, and storing keys avoids URL-parsing later. The publish flow already has access to the key when calling `put()` in `app/lib/image-gen.ts`.
- `expiresAt` is a derived display field; the source of truth for actual expiry is the Redis TTL on the key. They should agree at write time.

## Dependencies
None directly, but TASK-3, TASK-4, TASK-6 all depend on this.

## Estimated Effort
Small (< 1 day).
