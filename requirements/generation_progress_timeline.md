# Generation Progress Timeline

## Overview

During form generation, users currently see a single "Generating..." spinner with no visibility into what the AI is doing. This feature surfaces real-time progress steps in the chat UI — what the AI is planning, which images it's generating, and when the final HTML is being built. Steps persist in chat history for the session, visible by default with an option to collapse.

---

## Goals

1. Give users visibility into the AI's decision-making process during form generation
2. Reduce perceived wait time by showing meaningful progress instead of a blank spinner
3. Surface the AI's plan and image prompts so users understand what the AI decided and why
4. Maintain a consistent experience across both image and non-image generations

---

## User Experience

### During generation

When the user sends a prompt, the chat bubble area shows a **live vertical timeline** of steps as they complete. Each step appears with a status indicator:

- **In progress** — spinning indicator + step text
- **Completed** — checkmark + step text + elapsed time (e.g., "2.3s")
- **Failed** — error icon + step text + error message (with code if available)

Only one step is "in progress" at a time. New steps appear below completed ones.

### After generation completes

The timeline remains fully visible in the chat as a single message bubble. A small "Collapse" button/link at the bottom allows the user to collapse it into a single-line summary (e.g., "Form generated in 4 steps (12.4s)"). Clicking the collapsed summary expands it back to the full timeline.

The final "Form updated — see preview" message appears as a separate bubble after the timeline.

### Step definitions

Every generation shows at minimum steps 1, 2, and the final step. Image-related steps (3, 4) only appear when images are being generated.

| # | Step | Source | When shown |
|---|------|--------|------------|
| 1 | **Analyzing request...** | Emitted immediately when generation starts | Always |
| 2 | **Plan: {summary}** | From `announce_plan` function call response | Always (Gemini always calls this) |
| 3 | **Generating image: "{prompt}"** | From `generate_image` function call args | Only when images enabled and Gemini decides to generate |
| 4 | **Image ready, matching colors** | After image uploaded to Vercel Blob and vision follow-up sent | Only after step 3 |
| 5 | **Building final HTML...** | After all function calls resolve, Gemini generating final response | Always |
| 6 | **Done** | HTML received and parsed | Always |

If Gemini generates multiple images, steps 3-4 repeat for each image (e.g., "Generating image 1: ...", "Generating image 2: ...").

---

## Technical Approach

### Server-Sent Events (SSE)

The `/api/generate` endpoint must be changed from a JSON request/response to an SSE stream. The endpoint streams progress events as JSON lines, with the final event containing the HTML result.

**Event format:**
```json
{ "type": "step", "step": "analyze", "status": "started" }
{ "type": "step", "step": "plan", "status": "completed", "detail": "Dark theme with sunset header image and warm accent colors" }
{ "type": "step", "step": "image_gen", "status": "started", "detail": "A warm golden sunset over calm ocean waves, soft gradient sky" }
{ "type": "step", "step": "image_gen", "status": "completed", "detail": "Image uploaded", "imageType": "header" }
{ "type": "step", "step": "image_gen", "status": "failed", "detail": "Service Unavailable (503): model experiencing high demand", "imageType": "background" }
{ "type": "step", "step": "color_match", "status": "started" }
{ "type": "step", "step": "color_match", "status": "completed" }
{ "type": "step", "step": "html_gen", "status": "started" }
{ "type": "step", "step": "html_gen", "status": "completed" }
{ "type": "result", "html": "<!DOCTYPE html>...", "generatedImages": [...], "imageErrors": [...] }
```

**Why SSE over WebSockets:** SSE is simpler, works over HTTP, natively supported by `EventSource` / `fetch` with `ReadableStream`, and fits the unidirectional server→client flow. No need for bidirectional communication.

### `announce_plan` function declaration

A new function declaration added to the Gemini tools array (alongside `generate_image`). Unlike `generate_image`, this function is always included — even when images are disabled.

```
announce_plan({
  summary: string  // 1-2 sentence description of the plan
})
```

**System prompt addition:** Instruct Gemini to always call `announce_plan` first, before generating HTML or calling `generate_image`. The summary should describe the visual approach: layout choice, color direction, whether images will be used, and any notable design decisions.

**Function response:** The function response is a simple acknowledgment (`{ success: true }`). The purpose is to capture Gemini's plan as a progress event, not to influence the generation.

### Frontend changes

**ChatPanel.tsx:**
- Replace the current `fetch` + JSON parse with an SSE/streaming reader
- New state: `activeSteps` — array of `{ step, status, detail?, startedAt, completedAt? }`
- During generation, render the timeline in place of the current "Generating..." spinner
- After generation completes, persist the timeline as a message in the messages array (new message type: `timeline`)
- Add collapse/expand toggle on the timeline message

**Message types:**
- Existing: `{ role: "user" | "assistant", text: string }`
- New: `{ role: "assistant", type: "timeline", steps: Step[], totalDuration: number, collapsed: boolean }`

### Backend changes

**`lib/gemini.ts`:**
- Add `announce_plan` function declaration (always included)
- Accept a callback parameter for emitting progress events (e.g., `onProgress: (event: ProgressEvent) => void`)
- Call `onProgress` at each stage of the function calling loop
- Handle `announce_plan` function calls: extract summary, emit progress event, return acknowledgment to Gemini

**`app/api/generate/route.ts`:**
- Change from `NextResponse.json()` to a streaming `Response` with `text/event-stream` content type
- Create a `ReadableStream` with a controller
- Pass an `onProgress` callback to `generateForm` that writes SSE events to the stream
- Write the final result event and close the stream when generation completes

---

## Error Handling

- If `announce_plan` is not called by Gemini (unlikely but possible), skip the plan step — show "Planning..." as started, then jump to the next step when it arrives.
- If an image generation step fails, show the error on that step (with code and message) but continue — the generation proceeds and Gemini works without that image.
- If the entire generation fails (Gemini API error), emit a final error event: `{ "type": "error", "message": "..." }` and close the stream. The frontend shows the error as the last step in the timeline.
- If the SSE connection drops mid-stream, the frontend should show the last known state with a "Connection lost" indicator and offer a retry.

---

## Edge Cases

- **Very fast generations** (< 2 seconds): Steps will flash by quickly. This is fine — the completed timeline still provides useful context.
- **Multiple image generations**: Steps 3-4 repeat. Label them "Generating image 1: ...", "Generating image 2: ..." etc.
- **Regenerate last response**: The previous timeline message stays in history. A new timeline appears for the regeneration.
- **Session history**: Timelines persist in the chat for the session but are NOT included in the conversation history sent to Gemini (they're UI-only metadata, not part of the prompt/response flow).

---

## UI Specifications

### Timeline message bubble

```
  [Checkmark] Analyzing request...                           1.2s
  [Checkmark] Plan: Dark theme with a sunset header          0.8s
              image and warm orange accents
  [Checkmark] Generating image: "A warm golden sunset        8.4s
              over calm ocean waves..."
  [Checkmark] Image ready, matching colors                   3.1s
  [Checkmark] Building final HTML...                         4.2s
  [Checkmark] Done                                           -
                                                   [Collapse]
```

- Background: light gray (same as assistant messages)
- Step text: small font (text-sm), gray-700
- Checkmark: green for completed, amber spinner for in-progress, red X for failed
- Detail text (plan summary, image prompt): slightly indented, gray-500, may truncate with "..." and expand on click
- Elapsed time: right-aligned, gray-400, text-xs
- Collapse link: bottom-right, text-xs, gray-500

### Collapsed state

```
  Form generated in 6 steps (17.7s)              [Expand]
```

---

## Dependencies

| Dependency | Status | Notes |
|---|---|---|
| SSE streaming from Next.js App Router | Available | Use `ReadableStream` + `Response` with `text/event-stream` |
| `announce_plan` function calling | New | Requires Gemini system prompt update |
| No new npm packages required | - | Native `fetch` + `ReadableStream` on both sides |

---

## Out of Scope

- Editable/rejectable plans (user cannot modify the plan before generation proceeds)
- Streaming the HTML output character-by-character (we wait for the complete HTML)
- Persisting timelines across sessions (timelines are session-only, not stored in Redis)
- Progress percentage or progress bar (steps are discrete, not continuous)
