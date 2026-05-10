# TASK-4: Show concrete expiry date on publish success area

## Status
Not started

## Phase
Phase 3 — Frontend

## Priority
P1

## Description
After a successful publish, the inline success area on the same page (where the share URL is rendered) gains a line showing the form's concrete expiry date — e.g. *"Expires June 4, 2026"*. The date comes from the publish response (`expiresAt`), not from a locally computed offset, to avoid clock-drift bugs.

## Requirements
- `POST /api/publish` response includes `expiresAt` (in addition to whatever it already returns — share URL, id, etc.).
- `app/page.tsx` `handlePublish()` captures `expiresAt` into local state alongside the share URL.
- The publish success area renders a human-readable date derived from `expiresAt` (e.g. via `Intl.DateTimeFormat` `{ dateStyle: "long" }`).
- The expiry text updates after a successful 1-year extension (TASK-5 wires the update; this task just makes the display reactive to state).

## Acceptance Criteria
- [ ] Publish endpoint returns `expiresAt`.
- [ ] After publishing a form, the success area shows e.g. "Expires Jun 4, 2026" alongside the share URL.
- [ ] Date format is locale-friendly (uses `Intl.DateTimeFormat`, not hand-rolled string concatenation).
- [ ] State holds `expiresAt` separately from the share URL so it can update on extend.

## Technical Notes
- File: `app/page.tsx` (publish flow at lines 42-61, success area below).
- File: `app/api/publish/route.ts` — augment response.
- Keep the existing layout; this is one extra line of text. The "Keep for 1 year" action lands next to it (TASK-5) but is separate from this task's scope.

## Dependencies
- TASK-2 (record carries `expiresAt`).

## Estimated Effort
Small (< 1 day).
