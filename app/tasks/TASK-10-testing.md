# TASK-10: Add tests for SSE streaming and timeline logic

## Phase
Phase 4 — Quality Assurance

## Priority
P1

## Description
Write tests covering the critical paths of the SSE streaming implementation: the backend event emission, the frontend SSE parsing, timeline step state transitions, and error handling. Focus on integration-level tests for the SSE flow and unit tests for the timeline state management and component rendering.

## Requirements
- Backend tests for SSE event emission
- Frontend tests for SSE stream parsing
- Timeline component rendering tests
- Error scenario tests

## Acceptance Criteria
- [ ] Test: `generateForm` with `onProgress` callback emits events in correct order (analyze -> plan -> html_gen -> done)
- [ ] Test: `generateForm` with image generation emits image_gen and color_match events
- [ ] Test: `onProgress` callback receives correct detail text for plan and image steps
- [ ] Test: SSE event parser correctly handles multi-line buffers and split chunks
- [ ] Test: TimelineMessage renders correct number of steps with correct status icons
- [ ] Test: TimelineMessage collapse/expand toggles between full and summary view
- [ ] Test: Timeline step state transitions handle out-of-order events gracefully
- [ ] Test: Connection drop (stream ends without result) triggers error state
- [ ] Test: Fatal error event displays error message in timeline
- [ ] Test: Image generation failure shows on individual step without stopping overall generation

## Technical Notes
- Check if the project has an existing test setup. Look for `jest.config.*`, `vitest.config.*`, or test scripts in `package.json`.
- For SSE parsing tests, create mock `ReadableStream` objects that emit chunks of SSE data.
- For `generateForm` tests, mock the `GoogleGenerativeAI` client to return predetermined responses with function calls.
- For TimelineMessage component tests, use React Testing Library to verify rendering and interactions.
- The SSE event parser logic (buffer splitting, line parsing) should be extracted to a utility function for easier testing.

## Dependencies
TASK-3, TASK-4, TASK-5

## Estimated Effort
Large (2-3 days)
