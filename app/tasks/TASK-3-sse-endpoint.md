# TASK-3: Convert /api/generate to SSE streaming endpoint — COMPLETED

## Status
**COMPLETED** — Wave 2

## Phase
Phase 1 — Backend Foundation

## Priority
P0

## Description
Convert the `/api/generate` endpoint from a JSON request/response pattern to a Server-Sent Events (SSE) streaming response. Create a `ReadableStream` with a controller, pass an `onProgress` callback to `generateForm` that writes SSE events to the stream, and write the final result event (containing HTML, images, errors) before closing the stream. Handle errors by emitting an error event and closing the stream gracefully.

## Requirements
- Change response from `NextResponse.json()` to streaming `Response` with `text/event-stream`
- Stream progress events as JSON lines
- Final event contains the HTML result, generated images, and image errors
- Error events for unrecoverable failures
- Stream closes after final event or error

## Acceptance Criteria
- [ ] Endpoint returns `Response` with headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- [ ] Progress events are written as `data: {json}\n\n` format (standard SSE)
- [ ] Each progress event matches the spec format: `{ type: "step", step: "...", status: "...", detail?: "..." }`
- [ ] Final event is `{ type: "result", html: "...", generatedImages: [...], imageErrors: [...] }`
- [ ] On unrecoverable error, emits `{ type: "error", message: "..." }` and closes stream
- [ ] Stream controller properly closes after completion
- [ ] Request body parsing remains unchanged (still `req.json()`)

## Technical Notes
- Current endpoint: `app/api/generate/route.ts` (69 lines). The entire response handling (lines 60-64) must change.
- Use the pattern:
  ```typescript
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      // ... pass send as onProgress, then close
      controller.close();
    }
  });
  return new Response(stream, { headers: { ... } });
  ```
- The `onProgress` callback from TASK-2 maps directly to the `send` function here.
- Error handling (current lines 65-68) must move inside the stream's `start` function.
- Consider: if the client disconnects, the stream controller may error on `enqueue`. Wrap in try/catch.

## Dependencies
TASK-2

## Estimated Effort
Medium (1-2 days)
