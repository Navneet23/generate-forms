# Architecture — Forms AI Restyler MVP

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling (tool UI) | Tailwind CSS |
| AI Model | Gemini 3 Flash Preview (`@google/generative-ai`) |
| Image Generation | User-selectable: Gemini 2.5 Flash Image (`gemini-2.5-flash-image`) or Gemini 3.1 Flash Image (`gemini-3.1-flash-image-preview`) |
| Image Storage | Vercel Blob (CDN-backed permanent URLs) |
| Storage | Upstash Redis (published forms, 30-day default TTL, extendable to 1 year) |
| Runtime | Node.js via Next.js dev server |

---

## Project Structure

```
app/
├── app/
│   ├── page.tsx                        # Root UI shell, app state
│   ├── layout.tsx                      # HTML shell, metadata
│   ├── api/
│   │   ├── scrape/route.ts             # Scrapes Google Form structure
│   │   ├── generate/route.ts           # SSE streaming endpoint — calls Gemini, streams progress events, returns HTML
│   │   ├── generate-image/route.ts     # AI image generation via Nano Banana + Vercel Blob upload
│   │   ├── publish/route.ts            # Freezes HTML, returns shareable URL
│   │   ├── submit/[formId]/route.ts    # Proxies submissions to Google Forms
│   │   ├── upload/route.ts             # Hosts uploaded images (CDN/permanent)
│   │   └── screenshot/route.ts         # Server-side website screenshot for style guide
│   └── f/[id]/route.ts                 # Serves frozen published form HTML
├── components/
│   ├── UrlBar.tsx                      # URL input + Load Form button
│   ├── PreviewPane.tsx                 # iframe preview (baseline + AI-generated); opt-in screenshot overlay
│   ├── ChatPanel.tsx                   # Chat UI, SSE streaming, timeline rendering, toolbar buttons
│   ├── TimelineMessage.tsx             # Progress timeline component (live + collapsed views)
│   └── StyleGuideDialog.tsx            # Modal for uploading or URL-capturing a visual style reference
└── lib/
    ├── scraper.ts                      # Extracts + normalises FB_PUBLIC_LOAD_DATA_
    ├── gemini.ts                       # Gemini prompt layer (multimodal + function calling for image generation)
    ├── image-gen.ts                    # Shared image generation logic (Nano Banana + Vercel Blob upload)
    └── store.ts                        # Upstash Redis published form store
```

---

## Data Flow

### 1. Form Loading
```
Creator pastes URL
    → POST /api/scrape
    → Server fetches Google Form HTML
    → Extracts FB_PUBLIC_LOAD_DATA_ via bracket-depth walker
    → Normalises to FormStructure JSON
    → Preview pane shows original form in iframe
```

### 2. AI Generation (SSE streaming with progress timeline)
```
Creator types prompt → POST /api/generate
    → Sends: FormStructure + prompt + conversation history + previous HTML
              + optional screenshot base64 (selected region)
              + optional style guide (image base64 or website screenshot)
              + imageModel selection (none / gemini-2.5 / gemini-3.1)
              + activeImages from previous turns
    → Returns: Server-Sent Events (SSE) stream
    → Event flow:
        1. "analyze/started" — immediately on entry
        2. Gemini calls announce_plan → "plan/completed" with summary
        3. Gemini calls generate_image (0-N times) → "image_gen/started|completed|failed" per image
        4. Vision follow-up for color matching → "color_match/started|completed" per image
        5. Final HTML generation → "html_gen/started|completed"
        6. Final result event with HTML, images, errors → stream closes
    → Frontend renders live progress timeline during generation
    → On completion: preview pane replaces iframe with AI-generated srcdoc
```

**SSE event format:** `data: {json}\n\n`

| Event type | Fields | When |
|---|---|---|
| `step` | `step`, `status`, `detail?`, `imageType?`, `imageIndex?`, `imageCount?` | During generation |
| `result` | `html`, `generatedImages`, `imageErrors?` | Generation complete |
| `error` | `message` | Unrecoverable failure |

**Error handling:**
- Individual step failures (e.g. image_gen/failed) don't stop generation
- Fatal errors emit `{ type: "error" }` and close the stream
- Connection drops (stream ends without result) show "Connection lost" with retry option

### 3. Publish
```
Creator clicks Publish → POST /api/publish
    → Server assigns nanoid, stores HTML + formId + imageKeys in Redis (30-day TTL)
    → Returns shareable URL: /f/{id} and an expiresAt timestamp
    → Creator may optionally hit POST /api/forms/{id}/extend (one-time, idempotent)
      to bump the TTL to 1 year
    → GET /f/{id} serves frozen HTML as text/html
```

### 3a. Image lifecycle / sweeper
```
Daily cron → GET /api/cron/sweep-blobs
    → Lists every Vercel Blob in the bucket
    → Builds the set of imageKeys still referenced by live form records
      (via Redis SCAN over published forms)
    → Deletes blobs that are not referenced AND not freshly uploaded
      (1-hour safety window protects in-flight publishes)
    → See documentation/persisted-forms.md for operational details
```

### 4. Submission
```
Respondent submits form → POST /api/submit/{formId}  (from generated form JS)
    → Server maps entry.XXXXXXXXX fields to URLSearchParams
      (checkbox arrays are appended as separate entries, not comma-joined)
    → Server POSTs to https://docs.google.com/forms/d/e/{formId}/formResponse
    → Treats HTTP 200, 302, or 0 (opaque redirect) as success
    → Returns { status: "ok" } to respondent
```

---

## Key Components

### `lib/scraper.ts`

Extracts the Google Form structure from the `FB_PUBLIC_LOAD_DATA_` JavaScript variable embedded in the form's HTML page.

**Extraction method:** bracket-depth walker (not regex). Walks character-by-character tracking `[` / `]` depth to find the full JSON array. A non-greedy regex (`\[[\s\S]*?\]`) fails on nested arrays because it stops at the first `]`.

**Confirmed FB_PUBLIC_LOAD_DATA_ index mapping** (verified against live form):

| Path | Value |
|---|---|
| `raw[1][0]` | Form description (string) |
| `raw[1][1]` | Questions array |
| `raw[1][8]` | Form title (string) |

Each question in `raw[1][1]`:

| Path | Value |
|---|---|
| `q[0]` | Question ID |
| `q[1]` | Question text |
| `q[3]` | Type code (see map below) |
| `q[4][0][0]` | Entry ID number (prefixed with `entry.` for submission) |
| `q[4][0][1]` | Options array (for MCQ, checkboxes, dropdown) |
| `q[4][0][2]` | Required flag (1 = required) |

**Type code map:**

| Code | Type |
|---|---|
| 0 | short_answer |
| 1 | paragraph |
| 2 | multiple_choice |
| 3 | dropdown |
| 4 | checkboxes |
| 5 | linear_scale |
| 9 | date |
| 10 | time |

Unsupported types (grids, file upload) are silently skipped.

---

### `lib/gemini.ts`

Wraps the Gemini API. Builds a system prompt with the form structure and rules, then starts a chat session with conversation history for iterative refinement. Supports function calling for AI image generation.

**Model:** `gemini-3-flash-preview`

**System prompt rules enforced:**
1. Output raw HTML only — no markdown, no code fences
2. All CSS inline in `<style>` tag
3. All JS inline in `<script>` tag
4. All inputs use exact `entry.XXXXXXXXX` name attributes
5. Submit via fetch POST to the proxy URL; checkbox values sent as arrays; multi-step forms collect all values before submitting
6. Fully responsive
7. Always render form title and description at the top
8. Required field validation before submit — only for fields with `required: true` in the form structure; optional fields must remain optional
9. Linear scale: single horizontal row of radio buttons with labels under min/max values
10. Multi-step review pages must show actual entered values, not placeholder text
11. Page must fill full viewport (`min-height: 100vh`) with a background colour — never plain white
12. Question-by-question layout rules:
    - (a) Final step MUST always be a review page — no exceptions
    - (b) Single-selection questions (multiple_choice, dropdown, linear_scale) auto-advance on selection
    - (c) Auto-advance steps show helper text: "Select an option to continue"
    - (d) Multi-select/text questions (checkboxes, short_answer, paragraph, date, time) use an explicit Next button
    - (e) Pressing Enter on any step advances to the next step (except inside `<textarea>`)
    - (f) Every step after the first must include a Back button; the review page also has a Back button

**Image generation guidelines** (when `generate_image` tool is provided):
- Gemini decides whether images would enhance the form based on context
- Good candidates: event registrations, creative/branded forms, themed forms
- Poor candidates: simple surveys, feedback forms, plain data collection
- Image types: `background` (subtle, low-contrast), `header` (visually striking banner), `accent` (decorative)
- After receiving generated images as vision input, Gemini picks complementary form colors

**Function declarations:**
- `announce_plan` — Gemini MUST call this first to announce its generation plan (summary). Enables the progress timeline to show what the AI intends to do. If skipped, a fallback plan event is emitted automatically.
- `generate_image` — (when image model selected) Gemini may call zero, one, or multiple times in `AUTO` mode.

**Function calling flow:**
1. Gemini receives `announce_plan` + `generate_image` (when an image model is selected)
2. Gemini calls `announce_plan` first with a plan summary
3. Gemini may call `generate_image` zero or more times
4. Each image call triggers generation via selected model + Vercel Blob upload
5. Function responses (URLs) are sent back in one message
6. Generated images are sent as vision input in a separate follow-up message (Gemini SDK does not allow mixing `functionResponse` with other part types)
7. Gemini produces final HTML after seeing the actual generated images

**Progress callback (`onProgress`):** The `generateForm` function accepts an optional callback that receives `ProgressEvent` objects at each stage. The SSE endpoint passes a `send` function as this callback to stream events to the client in real-time.

**Conversation history:** last 10 turns are sent with each request for iterative refinement.

**Active images:** On subsequent generations, previously generated images are re-sent as vision input so Gemini maintains color coherence across edits.

**Known limitation — rare question text drift:** Despite the system prompt's strong language preserving form text verbatim (reinforced in commit `f5599da`), Gemini occasionally paraphrases question text or option labels — e.g. *"Rate your current baking/decorating experience."* rendered as *"Rate your current experience"*. This is non-deterministic and infrequent; retrying the generation usually produces correct output. A structural fix (post-generation diff against `structure.questions[].text` with auto-retry or auto-correction) is the right long-term solution but is out of scope.

---

### `lib/image-gen.ts`

Shared image generation logic used by both the generate route (via direct function call during Gemini's function calling loop) and the standalone `/api/generate-image` endpoint.

**Supported models** (user-selectable from the UI):
- `gemini-2.5-flash-image` — previous gen, default selection
- `gemini-3.1-flash-image-preview` — newer, faster, may have higher demand

**Error handling:** Exports `ImageGenError` class that parses Gemini SDK errors to extract HTTP status codes (e.g. 429 Too Many Requests, 503 Service Unavailable). Error codes and messages are surfaced to the user in the chat UI.

**Processing:**
1. Enhances the prompt with type-specific instructions (e.g. "keep subtle" for backgrounds)
2. Calls the user-selected image model with `responseModalities: ["TEXT", "IMAGE"]`
3. Extracts the base64 PNG from the response
4. Uploads to Vercel Blob → returns permanent CDN URL
5. Returns URL + base64 + mimeType

**Why a shared lib instead of HTTP self-fetch:** Vercel preview deployments have deployment protection that blocks unauthenticated requests to the same deployment. An internal `fetch("/api/generate-image")` from `/api/generate` would get a 401. Calling the function directly avoids this entirely.

### `app/app/api/generate-image/route.ts`

Thin HTTP wrapper around `lib/image-gen.ts`. Exposes image generation as a standalone API endpoint. Delegates all logic to the shared lib. Returns structured error responses with HTTP status code and message on failure.

**Request parameters:**
- `prompt` — detailed image generation prompt
- `imageType` — `background`, `header`, or `accent`
- `colorPalette` — dominant colors for the image
- `aspectRatio` — e.g. `16:9` for headers, `flexible` for backgrounds
- `modelId` — (optional) image model to use, defaults to `gemini-2.5-flash-image`

---

### `app/app/api/submit/[formId]/route.ts`

Proxies form submissions server-side to avoid CORS issues. Also handles preflight (`OPTIONS`) requests explicitly since the generated form runs in a `srcdoc` iframe which has a `null` origin — browsers send CORS preflight for cross-origin fetch even when destination is localhost.

All responses include:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

---

### `components/TimelineMessage.tsx`

Renders a vertical progress timeline for form generation steps. Used during live generation (with animated spinners) and in chat history (completed timelines with collapse/expand).

**Props:** `steps: TimelineStep[]`, `totalDuration: number`, `collapsed: boolean`, `onToggleCollapse: () => void`, `isLive: boolean`

**Step states:** `started` (amber spinner), `completed` (green checkmark), `failed` (red X icon)

**Multi-image support:** When multiple images are generated, steps show numbered labels ("Generating image 1: ...", "Generating image 2: ...") using `imageIndex` and `imageCount` fields.

**Collapsed view:** Single-line summary "Form generated in N steps (Xs)" with expand link.

---

### `components/ChatPanel.tsx`

Chat interface with toolbar buttons:
- **+ button** — upload image to embed in form
- **Screenshot button** — select a region of the preview to attach to message (only shown when AI form exists)
- **Style guide button** — open style reference dialog
- **Image model dropdown** — select image generation model: "No images", "Gemini 2.5 Flash image" (default), or "Gemini 3.1 Flash image". Purple when a model is selected.

Tracks `activeImages` (generated images from previous turns) and sends them with each generation request for color coherence.

**SSE streaming:** Uses `ReadableStream` reader to consume SSE events from `/api/generate`. Renders a live `TimelineMessage` during generation that updates in real-time as step events arrive. Supports `AbortController` for cancelling in-flight requests.

**Message types:** Discriminated union supporting text messages (user/assistant bubbles) and timeline messages (rendered as `TimelineMessage` component with collapse/expand state per message).

**Error display:** Image generation errors (e.g. API quota exceeded, service unavailable) are shown in amber warning bubbles with the HTTP status code and message. Connection drops and fatal errors are shown in the timeline with retry via "Regenerate last response". Publish errors are shown inline in the publish bar.

### `components/PreviewPane.tsx`

Renders the form preview. Two modes:
- **Baseline mode:** original Google Form in a regular `<iframe src=...>` (cross-origin, cannot be screenshotted)
- **Generated mode:** AI HTML in a sandboxed `<iframe srcdoc=...>`

**Screenshot overlay** is opt-in — it is NOT always active. The creator activates it by clicking the crop icon button in the chat toolbar. While active, a translucent blue overlay with crosshair cursor covers the preview; dragging draws a selection rectangle. On mouse-up, `html2canvas` runs inside the iframe to capture the selected region and the base64 is passed up to ChatPanel. The overlay deactivates automatically after capture, or when Escape is pressed.

### `components/StyleGuideDialog.tsx`

Modal dialog for providing a visual style reference to the AI. Two input modes:
- **Upload an image** — read client-side as base64 (supports file picker, drag-drop, and clipboard paste via Ctrl+V / Cmd+V), passed directly to Gemini as vision input; not stored server-side
- **Use a website** — URL is sent to `POST /api/screenshot`; server captures the page and returns a base64 screenshot

Optional "focus on" text field narrows AI interpretation. Style guide persists for the session and is re-attached on every subsequent AI call.

### `lib/store.ts`

Upstash Redis store keyed by nanoid. Stores `PublishedForm { html, formId, createdAt, expiresAt, extended, imageKeys }` with a 30-day default TTL. Exposes `save`, `get`, `extendForm` (one-time bump to 365 days), and `listAllImageKeys` (used by the sweeper to find live blob references). Pre-feature records that lack the new fields are tolerated: `expiresAt` is derived from `createdAt + 7 days`, `extended` defaults to `false`, `imageKeys` defaults to `[]`. Supports both `publish_KV_REST_API_*` (Vercel KV integration) and `KV_REST_API_*` (legacy) env var naming.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google AI Studio API key |
| `BLOB_READ_WRITE_TOKEN` | Yes | Vercel Blob authentication token for image uploads |
| `publish_KV_REST_API_URL` | Yes | Upstash Redis REST URL (set by Vercel KV integration) |
| `publish_KV_REST_API_TOKEN` | Yes | Upstash Redis auth token (set by Vercel KV integration) |
| `KV_REST_API_URL` | Fallback | Legacy Upstash Redis REST URL (used if `publish_*` vars not set) |
| `KV_REST_API_TOKEN` | Fallback | Legacy Upstash Redis auth token |
| `CRON_SECRET` | Yes | Bearer token Vercel Cron sends to the sweeper at `GET /api/cron/sweep-blobs` |
