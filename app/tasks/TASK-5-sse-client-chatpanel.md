# TASK-5: Replace fetch+JSON with SSE streaming reader in ChatPanel

## Phase
Phase 2 — Frontend

## Priority
P0

## Description
Replace the current `fetch` + `res.json()` pattern in `ChatPanel.tsx` with a streaming SSE reader that processes events from the updated `/api/generate` endpoint. Add state management for active timeline steps. During generation, render the `TimelineMessage` component (from TASK-4) instead of the "Generating..." spinner. Process each SSE event to update step state in real-time. On completion, persist the timeline as a new message type in the messages array.

## Requirements
- Replace JSON fetch with SSE `ReadableStream` reader
- New state: `activeSteps` array tracking each step's status and timing
- Render TimelineMessage during generation
- Persist completed timeline as a message after generation
- Handle SSE connection errors and stream termination

## Acceptance Criteria
- [ ] `send()` function in `ChatPanel.tsx` uses `fetch` with streaming response reader instead of `res.json()`
- [ ] SSE events are parsed line-by-line from the stream (handle `data: {...}\n\n` format)
- [ ] `activeSteps` state tracks all received steps with `startedAt` timestamps (client-side `Date.now()`)
- [ ] When a "step" event with status "started" arrives, a new step is added to `activeSteps`
- [ ] When a "step" event with status "completed"/"failed" arrives, the matching step is updated with `completedAt`
- [ ] During generation, `TimelineMessage` component is rendered with `isLive={true}` instead of the current spinner
- [ ] When "result" event arrives, HTML is extracted and `onHtmlUpdate` is called
- [ ] After generation completes, timeline is added to messages array as `{ role: "assistant", type: "timeline", steps, totalDuration, collapsed: false }`
- [ ] Existing "Form updated — see preview" message still appears after the timeline message
- [ ] "Regenerate last response" creates a new timeline, old one remains in history
- [ ] Connection drop shows "Connection lost" on the last step with a retry option
- [ ] Error events (`type: "error"`) display the error message in the timeline

## Technical Notes
- Current `send()` function: `ChatPanel.tsx` lines 112-194. The fetch call is at line 138-151. Replace lines 138-194.
- The `Message` interface (line 8-12) needs a union type to support timeline messages:
  ```typescript
  type Message = 
    | { role: "user" | "assistant"; text: string; imagePreview?: string }
    | { role: "assistant"; type: "timeline"; steps: TimelineStep[]; totalDuration: number; collapsed: boolean };
  ```
- SSE parsing pattern:
  ```typescript
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const event = JSON.parse(line.slice(6));
        // process event
      }
    }
  }
  ```
- Step label mapping: `analyze` -> "Analyzing request...", `plan` -> "Plan: {detail}", `image_gen` -> "Generating image: \"{detail}\"", etc.
- Timeline messages in `messages` array must NOT be included when building `history` for Gemini (the conversation history sent to the API). Filter them out when constructing the `history` prop update at line 175-179.

## Dependencies
TASK-3, TASK-4

## Estimated Effort
Large (2-3 days)
