# TASK-3: `POST /api/forms/[id]/extend` endpoint

## Status
Not started

## Phase
Phase 2 — Extension API

## Priority
P0

## Description
Implement a new route handler that extends a form's TTL to 365 days. Authorization is implicit (knowledge of the form id is sufficient — see FR3). The endpoint is one-time and idempotent: a form may be extended at most once, and repeat calls return the existing expiry without changing it.

## Requirements
- Route: `app/api/forms/[id]/extend/route.ts`, `POST` handler.
- On call with form id `id`:
  1. Load record via `get(id)`. If missing or expired, return `404`.
  2. If `record.extended === true`, return `200` with the existing `expiresAt` (no-op, idempotent).
  3. Otherwise:
     - Set `record.extended = true`.
     - Compute new `expiresAt = now + 365 days`.
     - Persist via a single Redis call that updates the value and sets TTL to 365 days (e.g. `redis.set(id, JSON.stringify(record), { ex: 365*24*60*60 })`).
     - Return `200` with the new `expiresAt`.
- Response shape: `{ expiresAt: string, extended: true }`.
- Errors: `404` for missing form. `500` for Redis errors. No body validation needed beyond the route param.

## Acceptance Criteria
- [ ] Endpoint exists at `app/api/forms/[id]/extend/route.ts` with a `POST` export.
- [ ] First successful call on a form sets `extended: true` and Redis TTL to 365 days.
- [ ] Second call on the same form returns `200` with the same `expiresAt` and does not shorten or re-extend.
- [ ] Call on a non-existent form id returns `404`.
- [ ] Concurrent calls (best effort): both succeed without corrupting the record (the second write is harmless because the resulting state is identical).
- [ ] No auth check — any caller with the id may extend (matches FR3).

## Technical Notes
- Use a single `redis.set(..., { ex })` rather than `redis.expire` so the `extended: true` flag and the TTL are written atomically. Avoids a window where TTL is bumped but the flag is not yet set.
- `nanoid(10)` is the existing id format; route param is the same id used in `/f/[id]`.
- Idempotency is enforced by the `extended` flag, not by inspecting current TTL — TTL alone is unreliable (clock drift, partial writes).

## Dependencies
- TASK-2 (needs `extended` field on `PublishedForm`).

## Estimated Effort
Small (< 1 day).
