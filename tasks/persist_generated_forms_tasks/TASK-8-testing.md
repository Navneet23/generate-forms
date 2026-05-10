# TASK-8: Testing

## Status
Not started

## Phase
Phase 4 — Image Lifecycle + Quality

## Priority
P1

## Description
Verify the user-visible flow and the cleanup mechanism end-to-end. Existing repo conventions appear to be light on automated tests; follow whatever pattern is already in place (e.g. `test_redis.mjs` script-style verification) rather than introducing a heavy test framework just for this feature.

## Requirements
The following scenarios must be exercised, manually or scripted:

**Default retention (FR1, NFR1)**
- Publish a new form. Verify `redis.ttl(id)` is within ~30 days.
- Confirm a previously-stored 7-day form (if any) retains its original TTL.

**Extension flow (FR2, FR3, NFR2)**
- Publish a form, click "Keep it for 1 year". Verify Redis TTL is now ~365 days and `extended: true` on the record.
- Click again (or POST to the endpoint a second time): TTL should not change; response should match the existing `expiresAt`.
- POST to a non-existent form id: returns `404`.

**Expiry display (FR5)**
- Publish a form: success area shows a date ~30 days out.
- After extending: success area shows a date ~1 year out.
- Date format renders correctly across at least one non-en-US locale.

**Image cleanup (FR4, NFR3)**
- Publish a form with images. Verify `imageKeys` on the record matches the actual blob keys. Verify blobs exist.
- Manually expire (or delete) the form record. Run the sweeper. Verify the blobs are deleted.
- Publish a form, run the sweeper before the form expires: blobs are not deleted.
- Sweeper run with a freshly-uploaded blob (< 1 hour old) but no form record: blob is *not* deleted (safety net).

**Idempotency / robustness**
- Two simultaneous extend calls: both succeed, end state is `extended: true` with 365-day TTL, no corruption.

## Acceptance Criteria
- [ ] All scenarios above pass.
- [ ] A short script (or `test_redis.mjs`-style file) exists for the Redis-side checks (TTL math, idempotency) so they're repeatable.
- [ ] Sweeper checks documented as a runbook step (since they're harder to script without a real blob bucket).

## Technical Notes
- Existing `test_redis.mjs` shows the project's lightweight verification style — follow it.
- Don't introduce Jest/Vitest/etc. just for this feature unless that's already in the roadmap.

## Dependencies
- TASK-3, TASK-5, TASK-7 (the things being tested).

## Estimated Effort
Small-to-Medium (~1 day).
