# TASK-7: Orphan-blob sweeper

## Status
Not started

## Phase
Phase 4 — Image Lifecycle + Quality

## Priority
P0

## Description
Build a scheduled job that deletes Vercel Blob objects whose owning form is no longer alive in Redis. Because Redis TTL expirations don't fire callbacks and Vercel Blob has no native TTL, this sweeper is the mechanism that realizes FR4 (image lifecycle mirrors form lifecycle).

## Requirements
- Sweeper is implemented as a Vercel Cron-invoked route, e.g. `app/api/cron/sweep-blobs/route.ts`. Schedule: hourly or daily (start daily; tighten if needed).
- Algorithm:
  1. List all blobs in the bucket (paginated as needed via `@vercel/blob` `list()`).
  2. Build the set of blob keys still referenced by live forms. Source of truth: scan live form records (e.g. `redis.scan` for the form key namespace, then read each record's `imageKeys`).
  3. For every blob key not in that set, delete via `@vercel/blob` `del()`.
- Safety net: skip blobs younger than 1 hour (created very recently) to avoid racing with an in-flight publish that hasn't yet written the form record.
- Pre-feature records (no `imageKeys` field) are treated as "no claim" — they do not protect blobs. (Pre-feature blobs are out of scope per requirements; sweeper ignoring them is acceptable.)
- Log per run: blobs scanned, blobs deleted, errors.

## Acceptance Criteria
- [ ] Cron route exists at `app/api/cron/sweep-blobs/route.ts` (or equivalent) and is registered in `vercel.json`.
- [ ] Sweeper deletes blobs whose form id is missing from Redis AND whose blob key is not present on any live form record.
- [ ] Sweeper does not delete blobs younger than 1 hour.
- [ ] Sweeper does not delete a blob that is still referenced by any live form's `imageKeys`.
- [ ] Sweeper completes without error in a smoke run against a development environment with a mix of live and expired forms.
- [ ] Logs (or run metrics) capture deleted-count and error-count.

## Technical Notes
- Listing all blobs and scanning all forms is O(N) over both — fine at current scale; revisit if blob count grows significantly.
- Vercel Cron routes need a `CRON_SECRET` style guard to prevent public invocation — follow whatever pattern is already in use, or add one.
- Be careful with the "still referenced" check: build the *set* of in-use keys before iterating blobs to delete, so the comparison is O(1) per blob, not O(forms) per blob.
- If `redis.scan` returns the form key namespace mixed with other keys, namespace form ids during writes (e.g. prefix `form:`) — but only do this if there isn't already a clean way to identify form keys; do not refactor the schema beyond what this feature requires.

## Dependencies
- TASK-6 (image keys must be on form records before sweeper trusts them as authoritative).

## Estimated Effort
Medium (~2 days).
