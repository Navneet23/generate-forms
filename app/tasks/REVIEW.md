# Requirements Review: Generation Progress Timeline

## 1. Summary

This feature replaces the current "Generating..." spinner with a real-time vertical timeline showing each step of the AI form generation process. The backend switches from JSON request/response to Server-Sent Events (SSE), streaming progress events as the AI plans, generates images, and builds HTML. A new `announce_plan` Gemini function call captures the AI's plan as a visible step. The timeline persists in chat history with collapse/expand functionality.

## 2. Assumptions

### Safe assumptions
- **SSE over Next.js App Router is stable**: `ReadableStream` + `Response` with `text/event-stream` is well-supported in Next.js 14+ App Router. The requirements correctly identify this.
- **Gemini will reliably call `announce_plan` first**: The requirements state "Gemini always calls this" — with proper system prompt instructions, this is a reasonable assumption for Gemini 3 Flash.
- **No new npm packages needed**: Native `fetch` + `ReadableStream` + `EventSource` pattern works on both sides. Correct.
- **Timeline messages are session-only**: Not sent back to Gemini in conversation history. This is sound — they're UI metadata, not conversational context.

### Risky assumptions
- **Single step in-progress at a time**: The current code processes multiple `generate_image` function calls that Gemini may request in a single response (see `lib/gemini.ts` line 269-278, the `functionCalls` array). If Gemini requests 2+ images simultaneously, the "one step at a time" model breaks unless we serialize image generation or emit overlapping steps. Currently images are generated sequentially in a `for` loop (line 287), so this is safe today, but the assumption should be documented.
- **`announce_plan` always fires before other function calls**: Gemini function calling doesn't guarantee ordering of multiple function calls in a single response. If Gemini returns `announce_plan` + `generate_image` in one response, we need to process `announce_plan` first regardless of part order.
- **Connection stability for SSE**: The requirements mention "connection lost" handling but don't specify retry semantics (exponential backoff? immediate retry? max retries?).

## 3. Open Questions

1. **What happens on "Regenerate last response"?** The requirements say a new timeline appears, but should the old timeline remain expanded or auto-collapse? Should the old timeline's steps show they were superseded?

2. **Mobile responsiveness of the timeline**: The chat panel is fixed at `w-80 xl:w-96` (`app/page.tsx` line 84). How should the timeline render in this narrow width, especially with long image prompts and right-aligned timestamps?

3. **Rate limiting / concurrent requests**: If the user clicks "Send" while a generation is in-progress (currently prevented by `loading` guard in `ChatPanel.tsx` line 113), should the SSE stream be abortable? Should we add an `AbortController`?

4. **`announce_plan` in non-image flows**: The spec says `announce_plan` is always included, but the current tools array is empty when images are disabled (`lib/gemini.ts` line 163-168). Adding `announce_plan` means the tools array is never empty. Does this affect Gemini's behavior for simple non-image requests?

5. **Error event format**: The spec shows `{ "type": "error", "message": "..." }` but doesn't specify whether this should also include a step identifier or error code for structured error handling on the frontend.

6. **Step timing granularity**: The spec says elapsed time like "2.3s". Is this wall-clock time from step start to step completion? Should the "Done" step show total generation time or just "—"?

## 4. Potential Issues & Risks

### Technical Risks
- **SSE and Vercel serverless timeout**: Vercel serverless functions have a 10-second timeout on the Hobby plan (60s on Pro). Image generation can take 8-15 seconds per image. A generation with 2 images could easily exceed 30 seconds. SSE keeps the connection open, but Vercel may still timeout the function. **Mitigation**: Verify the deployment tier supports long-running SSE streams; consider Vercel's streaming response support.
- **Gemini chat session state during SSE**: The current `generateForm` function uses `chat.sendMessage()` in a loop (`lib/gemini.ts` lines 255-362). Converting this to emit SSE events mid-loop requires careful callback threading. The `onProgress` callback must write to the SSE stream controller, which must remain open. If the client disconnects mid-stream, the Gemini API calls continue running server-side with no consumer.
- **`announce_plan` adding a function-calling round trip**: Every generation will now require at least one additional Gemini API call (send function response for `announce_plan`, then get the next response). This adds latency — roughly 1-2 seconds per round trip.

### Product Risks
- **Perceived slowness from step visibility**: Paradoxically, showing steps can make fast generations feel slower if users watch each step animate. The spec acknowledges this ("Steps will flash by quickly. This is fine") but it could hurt perception for the common non-image case where generation takes 3-5 seconds.
- **Plan text quality**: The `announce_plan` summary depends entirely on Gemini's output quality. Poor or generic summaries ("I will make a form") would undermine the feature's value.

### Operational Risks
- **Debug logging in production**: The current code writes to `debug.log` locally (`lib/gemini.ts` lines 14-21). SSE events will add more logging. Ensure debug logging doesn't interfere with SSE stream output.

## 5. Tradeoffs

### Tradeoff 1: SSE vs. Polling
- **SSE (chosen)**: Real-time push, simpler protocol, native browser support. Con: keeps connection open, Vercel timeout risk.
- **Polling**: Client polls a status endpoint every 1-2s. Pro: no long-lived connections, works with any serverless timeout. Con: higher latency, more complex, more API calls.
- **Recommendation**: SSE is correct for this use case. The unidirectional flow and real-time requirement make it the right choice. Mitigate Vercel timeout with proper plan tier.

### Tradeoff 2: `announce_plan` as function call vs. structured output
- **Function call (chosen)**: Fits the existing function calling loop, naturally emits a progress event. Con: adds a round trip to Gemini.
- **Structured output prefix**: Ask Gemini to output a JSON plan block before the HTML. Pro: no extra round trip. Con: fragile parsing, doesn't integrate with the function calling pattern.
- **Recommendation**: Function call is cleaner and more reliable. The 1-2s latency cost is acceptable given the feature's value.

### Tradeoff 3: Timeline as message type vs. separate UI region
- **Message type (chosen)**: Timeline lives in the chat message list as a new message type. Pro: natural scroll behavior, persists in history, consistent layout. Con: requires expanding the message type system.
- **Separate UI region**: Fixed region above/below messages during generation. Pro: visually distinct. Con: doesn't persist, complex layout management.
- **Recommendation**: Message type is correct. It aligns with the chat-based UX paradigm.

### Tradeoff 4: Client-side vs. server-side step timing
- **Client-side timing (recommended)**: Frontend timestamps when each step event arrives. Simpler, no clock sync issues.
- **Server-side timing**: Server includes timestamps in each event. More accurate but adds complexity and clock sync considerations.
- **Recommendation**: Client-side timing. The display resolution is 0.1s — network latency of 10-50ms is negligible.

## 6. Out of Scope (but worth noting)

- **Cancelable generations**: Users cannot cancel a generation mid-stream. If they navigate away or close the browser, the server-side Gemini calls continue and waste API credits. Future consideration: `AbortController` integration.
- **Step-level retry**: If image generation fails, the user cannot retry just that step. They must regenerate the entire form.
- **Analytics / telemetry on step durations**: The timeline captures valuable performance data (which steps are slow, failure rates). Worth instrumenting in the future.
- **Accessibility**: The timeline uses color (green/amber/red) for status. Should also include screen-reader-friendly labels (`aria-label`) and not rely solely on color. The spec doesn't address this.
- **Streaming HTML output**: The spec explicitly excludes character-by-character HTML streaming. Worth revisiting — it would further reduce perceived wait time for the final step.
- **Offline / PWA considerations**: SSE requires an active connection. If the app becomes a PWA, SSE handling needs offline-aware logic.
