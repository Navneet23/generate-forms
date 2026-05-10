# TASK-9: Documentation

## Status
Not started

## Phase
Phase 4 — Image Lifecycle + Quality

## Priority
P2

## Description
Update project documentation so the new retention behavior, extension semantics, and sweeper are discoverable. Follow the existing documentation style (see `documentation/` and `requirements/`).

## Requirements
- README (or appropriate top-level doc) notes:
  - Default retention is 30 days.
  - Forms can be extended once, to 1 year, from the publish success view.
  - Authorization: knowledge of the form id.
- A short operational note (in `documentation/`) on the sweeper:
  - What it does.
  - Schedule.
  - What it deliberately does *not* clean up (pre-feature blobs; very-recent blobs).
  - How to run it manually for debugging.
- `requirements/persist-generated-forms.md` is already authoritative — link to it from the README rather than restating the spec.

## Acceptance Criteria
- [ ] README mentions 30-day default and 1-year extension option.
- [ ] Operational note for sweeper exists.
- [ ] Pre-feature orphaned blobs are explicitly called out as out-of-scope, with the rationale (so a future reader doesn't assume the sweeper handles them).

## Technical Notes
- Keep it short; this feature has one happy path and one cleanup path.
- No need to document internal type changes beyond what's useful for an operator or future contributor.

## Dependencies
- TASK-1 through TASK-7 (so the docs describe shipped behavior, not aspirational).

## Estimated Effort
Trivial-to-Small (< 1 day).
