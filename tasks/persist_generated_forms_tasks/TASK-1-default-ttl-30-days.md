# TASK-1: Bump default form TTL from 7 days to 30 days

## Status
Not started

## Phase
Phase 1 — Storage Foundation

## Priority
P0

## Description
Replace the 7-day TTL constant in the form store with 30 days, so newly published forms persist for a month by default. Existing forms in Redis are not migrated — they expire on their original schedule (NFR1).

## Requirements
- `TTL_SECONDS` in `app/lib/store.ts` reflects 30 days (`30 * 24 * 60 * 60`).
- `save(id, record)` continues to use `redis.set(id, ..., { ex: TTL_SECONDS })`, just with the new value.
- No migration script or backfill — strictly a default-going-forward change (NFR1).

## Acceptance Criteria
- [ ] `TTL_SECONDS` at `app/lib/store.ts:14` is `30 * 24 * 60 * 60`.
- [ ] Comment on the constant updated to reflect "30 days".
- [ ] A newly published form's Redis key has a TTL within ~30 days of publish time (verified via `redis.ttl`).
- [ ] An existing 7-day form, untouched by this change, still has its original remaining TTL.

## Technical Notes
- File: `app/lib/store.ts`, single-line change at line 14.
- No schema implications — TASK-2 handles record shape changes separately so this can land standalone.

## Dependencies
None.

## Estimated Effort
Trivial (< 1 hour).
