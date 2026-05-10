# TASK-5: "Keep it for 1 year" action on publish success area

## Status
Not started

## Phase
Phase 3 — Frontend

## Priority
P0

## Description
Add a "Keep it for 1 year" button to the publish success area. Clicking it calls `POST /api/forms/[id]/extend`, then replaces the button with a confirmed state ("Kept for 1 year — Expires Jun 4, 2027") and updates the displayed expiry date. The action is one-time per form (FR2): once confirmed, the button does not return.

## Requirements
- Action lives inline in the publish success area, next to the expiry text from TASK-4.
- Initial state: button labeled "Keep it for 1 year".
- On click:
  - Disable button, show pending state ("Extending…").
  - `POST /api/forms/[id]/extend`.
  - On `200`: read `expiresAt` from response, update displayed expiry, replace button with confirmed text (e.g. "Kept for 1 year ✓").
  - On error: re-enable the button, surface a non-blocking error message.
- Local state remembers that this form has been extended for the lifetime of the publish session. Refreshing the page does not re-show the button (the user has already gotten their share URL and is unlikely to need it again on the same session, but if they do publish a new form, that new form starts fresh).

## Acceptance Criteria
- [ ] Button appears after publish completes, in the same area as the share URL and expiry date.
- [ ] Clicking the button calls the extend endpoint and updates UI on success.
- [ ] Confirmed state shows the new 1-year expiry date and is non-interactive.
- [ ] Errors do not lock the user out — button returns to clickable state with a visible error.
- [ ] No "extend later" path elsewhere in the app (per requirements out-of-scope list).

## Technical Notes
- File: `app/page.tsx`, near the existing publish handler at lines 42-61 and the success area below.
- Reuse the existing styling vocabulary (the green "Publish" button at lines 107-113 is the closest reference for button styling).
- Don't store anything in localStorage; ephemeral session state is enough — this is a one-shot interaction tied to a successful publish.

## Dependencies
- TASK-3 (extend endpoint).
- TASK-4 (expiry date display).

## Estimated Effort
Small-to-Medium (~1 day).
