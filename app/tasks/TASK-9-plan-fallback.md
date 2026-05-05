# TASK-9: Handle missing announce_plan gracefully

## Phase
Phase 3 — Robustness

## Priority
P1

## Description
Although Gemini is instructed to always call `announce_plan` first, edge cases may cause it to skip the call (model non-determinism, prompt injection, API changes). Implement a fallback: show "Planning..." as a started step, and if the next event arrives without `announce_plan` having completed, auto-complete the plan step with a generic message and proceed. This ensures the timeline never gets stuck waiting for a plan that won't come.

## Requirements
- Detect when `announce_plan` is skipped
- Auto-complete the plan step with fallback text
- No user-visible error — just a graceful degradation

## Acceptance Criteria
- [ ] If `announce_plan` is called, plan step shows "Plan: {summary}" as specified
- [ ] If Gemini skips `announce_plan` and proceeds to `generate_image` or final HTML, the plan step auto-completes with "Plan: (auto-detected)" or similar
- [ ] No step remains in "started" status indefinitely
- [ ] The fallback is handled in `lib/gemini.ts` — if the function calling loop exits without `announce_plan` having been called, emit a plan step anyway
- [ ] The "analyze" step transitions to completed when the first Gemini response arrives, regardless of whether it contains `announce_plan`

## Technical Notes
- In `lib/gemini.ts`, track whether `announce_plan` was called using a boolean flag.
- After the function calling loop (line 362), check the flag. If false, emit a plan completed event with a generic detail.
- On the frontend, the "analyze" step should auto-complete when ANY step event after it arrives (i.e., if plan starts, analyze is done; if image_gen starts without plan, both analyze and plan should auto-complete).
- The frontend should maintain step ordering invariants: steps always appear in the defined order, and later steps imply earlier steps are complete.

## Dependencies
TASK-1, TASK-2

## Estimated Effort
Small (< 1 day)
