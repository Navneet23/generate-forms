# TASK-2: Add onProgress callback to generateForm

## Phase
Phase 1 — Backend Foundation

## Priority
P0

## Description
Add an `onProgress` callback parameter to the `generateForm` function in `lib/gemini.ts`. This callback will be invoked at each stage of the generation process: when analysis starts, when `announce_plan` is received, when image generation starts/completes/fails, when HTML generation starts, and when done. Define the `ProgressEvent` type that covers all step types and statuses. This callback is the bridge between the Gemini processing loop and the SSE stream.

## Requirements
- `onProgress` callback parameter on `generateForm`
- `ProgressEvent` type definition covering all step/status combinations
- Emit events at correct points in the function calling loop
- Backward compatible — callback is optional

## Acceptance Criteria
- [ ] `ProgressEvent` type exported from `lib/gemini.ts` with fields: `type`, `step`, `status`, `detail?`, `imageType?`
- [ ] `generateForm` accepts optional `onProgress: (event: ProgressEvent) => void` parameter
- [ ] "analyze/started" event emitted immediately when `generateForm` is called
- [ ] "plan/completed" event emitted when `announce_plan` function call is processed, with plan summary as detail
- [ ] "image_gen/started" event emitted before each `imageGenerator()` call, with prompt as detail
- [ ] "image_gen/completed" event emitted after successful image generation, with imageType
- [ ] "image_gen/failed" event emitted on image generation error, with error message as detail
- [ ] "color_match/started" and "color_match/completed" events emitted around vision follow-up
- [ ] "html_gen/started" event emitted after all function calls resolve, before final text extraction
- [ ] "html_gen/completed" event emitted after HTML is extracted
- [ ] If `onProgress` is not provided, no errors — all calls are guarded

## Technical Notes
- The function calling loop is at `lib/gemini.ts` lines 260-362. The key insertion points:
  - Line 255 (after `sendMessage`): emit "analyze/started" right before the first `chat.sendMessage(parts)` call
  - Inside `announce_plan` handler (new from TASK-1): emit "plan/completed"
  - Line 297 (before `imageGenerator()` call): emit "image_gen/started"
  - Line 308 (after successful image): emit "image_gen/completed"
  - Line 336 (in catch block): emit "image_gen/failed"
  - Line 358-360 (vision follow-up): emit "color_match/started" before and "color_match/completed" after
  - After the while loop exits (line 364): emit "html_gen/started" then "html_gen/completed"
- The `onProgress` parameter should be added after `activeImages` in the function signature (line 145-156).
- The `route.ts` call site (line 47-58) must be updated to pass the callback.

## Dependencies
TASK-1

## Estimated Effort
Medium (1-2 days)
