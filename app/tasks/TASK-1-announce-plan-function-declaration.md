# TASK-1: Add announce_plan function declaration to Gemini tools — COMPLETED

## Status
**COMPLETED** — Wave 1, commit 41b10fe

## Phase
Phase 1 — Backend Foundation

## Priority
P0

## Description
Add a new `announce_plan` function declaration to the Gemini tools array in `lib/gemini.ts`. Unlike `generate_image`, this function should always be included in the tools — even when images are disabled. Update the system prompt to instruct Gemini to always call `announce_plan` first before generating HTML or calling `generate_image`. Handle the function call response in the function calling loop by extracting the summary and returning a simple `{ success: true }` acknowledgment.

## Requirements
- `announce_plan` function declaration with a `summary` string parameter
- Always included in tools array (not gated by `includeImages`)
- System prompt instructs Gemini to call it first
- Function response is `{ success: true }`

## Acceptance Criteria
- [ ] `announce_plan` function declaration exists in `lib/gemini.ts` with `summary: string` parameter
- [ ] Tools array always includes `announce_plan`, regardless of `includeImages` flag
- [ ] System prompt includes instruction to call `announce_plan` before any other function calls or HTML generation
- [ ] Function calling loop handles `announce_plan` by returning `{ success: true }` to Gemini
- [ ] Existing `generate_image` flow is unaffected
- [ ] Non-image generations now include one extra round trip for `announce_plan`

## Technical Notes
- Current tools array construction is at `lib/gemini.ts` lines 163-168. Currently empty when `includeImages` is false. Change to always include `announce_plan`.
- Function calling loop starts at line 260. Add a branch for `name === "announce_plan"` alongside the existing `name === "generate_image"` branch (line 295).
- System prompt is built at `buildSystemPrompt()` (line 75). Add plan instruction after the existing rules, before the form structure JSON.
- The `announce_plan` handler should push a functionResponse part similar to the image error case (line 339-347), but with `{ success: true }`.

## Dependencies
None

## Estimated Effort
Small (< 1 day)
