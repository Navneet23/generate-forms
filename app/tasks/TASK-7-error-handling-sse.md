# TASK-7: Implement SSE error handling and connection recovery — COMPLETED

## Status
**COMPLETED** — Wave 4

## Phase
Phase 3 — Robustness

## Priority
P1

## Description
Implement comprehensive error handling for the SSE streaming flow. Handle three categories: (1) individual step failures (image gen errors) that don't stop the overall generation, (2) fatal errors from the Gemini API that terminate the stream, and (3) SSE connection drops mid-stream. For connection drops, show the last known state with a "Connection lost" indicator and offer a retry button that re-sends the same prompt.

## Requirements
- Step-level error display (image generation failures shown inline)
- Fatal error event handling (Gemini API errors)
- Connection drop detection and recovery UI
- Retry mechanism for failed generations

## Acceptance Criteria
- [ ] When `image_gen/failed` event arrives, the step shows red X icon with error message and code
- [ ] Generation continues after image failures — subsequent steps still appear
- [ ] When `{ type: "error" }` event arrives, timeline shows error as the final step and generation stops
- [ ] When the SSE stream closes unexpectedly (reader returns `done` without a result event), show "Connection lost" indicator
- [ ] "Connection lost" state shows a "Retry" button that re-sends the original prompt
- [ ] Retry clears the failed timeline and starts a new one
- [ ] If the stream reader throws an error (network failure), catch it and show the error in the timeline
- [ ] Loading state (`setLoading(false)`) is properly reset in all error paths

## Technical Notes
- The current error handling in `ChatPanel.tsx` is at lines 185-194 (catch block). This needs to be augmented for SSE-specific errors.
- For connection drop detection: if the reader's `while(true)` loop exits via `done === true` but no "result" event was received, treat it as a connection drop.
- The retry mechanism can reuse the existing `lastPrompt` state (line 63) and call `send(lastPrompt)`.
- On the backend (`route.ts`), wrap the stream's `start` function body in try/catch. On error, emit `{ type: "error", message: "..." }` then `controller.close()`.
- Consider adding an `AbortController` to the fetch call so if the user navigates away or starts a new generation, the old stream is properly cancelled.

## Dependencies
TASK-3, TASK-5

## Estimated Effort
Medium (1-2 days)
