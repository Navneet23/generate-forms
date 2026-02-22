# Architecture — Forms AI Restyler MVP

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling (tool UI) | Tailwind CSS |
| AI Model | Gemini 3 Flash Preview (`@google/generative-ai`) |
| Image Generation | Gemini 2.5 Flash Image / Nano Banana (`gemini-2.5-flash-image`) |
| Image Storage | Vercel Blob (CDN-backed permanent URLs) |
| Storage | Upstash Redis (published forms, 7-day TTL) |
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
│   │   ├── generate/route.ts           # Calls Gemini, returns HTML (handles function calling loop)
│   │   ├── generate-image/route.ts     # AI image generation via Nano Banana + Vercel Blob upload
│   │   ├── publish/route.ts            # Freezes HTML, returns shareable URL
│   │   ├── submit/[formId]/route.ts    # Proxies submissions to Google Forms
│   │   ├── upload/route.ts             # Hosts uploaded images (CDN/permanent)
│   │   └── screenshot/route.ts         # Server-side website screenshot for style guide
│   └── f/[id]/route.ts                 # Serves frozen published form HTML
├── components/
│   ├── UrlBar.tsx                      # URL input + Load Form button
│   ├── PreviewPane.tsx                 # iframe preview (baseline + AI-generated); opt-in screenshot overlay
│   ├── ChatPanel.tsx                   # Chat UI, triggers generation, screenshot/upload/style guide/images buttons
│   └── StyleGuideDialog.tsx            # Modal for uploading or URL-capturing a visual style reference
└── lib/
    ├── scraper.ts                      # Extracts + normalises FB_PUBLIC_LOAD_DATA_
    ├── gemini.ts                       # Gemini prompt layer (multimodal + function calling for image generation)
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

### 2. AI Generation (with optional image generation)
```
Creator types prompt → POST /api/generate
    → Sends: FormStructure + prompt + conversation history + previous HTML
              + optional screenshot base64 (selected region)
              + optional style guide (image base64 or website screenshot)
              + includeImages flag + activeImages from previous turns
    → Gemini receives generate_image function declaration (if images enabled)
    → Gemini decides whether images would enhance the form
    → If yes: Gemini calls generate_image (one or more times via function calling)
        → POST /api/generate-image
        → Nano Banana generates image (base64 PNG)
        → Image uploaded to Vercel Blob → CDN URL returned
        → Function response sent back to Gemini
        → Generated image sent as vision input (separate message) so Gemini
          can see actual colors and pick complementary form theme
    → Gemini returns complete self-contained HTML page (with image URLs embedded)
    → Preview pane replaces original iframe with AI-generated srcdoc iframe
```

### 3. Publish
```
Creator clicks Publish → POST /api/publish
    → Server assigns nanoid, stores HTML + formId in Redis (7-day TTL)
    → Returns shareable URL: /f/{id}
    → GET /f/{id} serves frozen HTML as text/html
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

**Function calling flow:**
1. Gemini receives `generate_image` function declaration (when "Include images" is enabled)
2. Gemini may call it zero, one, or multiple times in `AUTO` mode
3. Each call triggers image generation via Nano Banana + Vercel Blob upload
4. Function responses (URLs) are sent back in one message
5. Generated images are sent as vision input in a separate follow-up message (Gemini SDK does not allow mixing `functionResponse` with other part types)
6. Gemini produces final HTML after seeing the actual generated images

**Conversation history:** last 10 turns are sent with each request for iterative refinement.

**Active images:** On subsequent generations, previously generated images are re-sent as vision input so Gemini maintains color coherence across edits.

---

### `app/app/api/generate-image/route.ts`

Generates AI images using Nano Banana (`gemini-2.5-flash-image`) and uploads them to Vercel Blob.

**Request parameters** (from Gemini's function call):
- `prompt` — detailed image generation prompt written by Gemini
- `imageType` — `background`, `header`, or `accent`
- `colorPalette` — dominant colors for the image
- `aspectRatio` — e.g. `16:9` for headers, `flexible` for backgrounds

**Processing:**
1. Enhances the prompt with type-specific instructions (e.g. "keep subtle" for backgrounds)
2. Calls Nano Banana with `responseModalities: ["TEXT", "IMAGE"]`
3. Extracts the base64 PNG from the response
4. Uploads to Vercel Blob → returns permanent CDN URL
5. Returns URL + base64 + mimeType to the caller

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

### `components/ChatPanel.tsx`

Chat interface with toolbar buttons:
- **+ button** — upload image to embed in form
- **Screenshot button** — select a region of the preview to attach to message (only shown when AI form exists)
- **Style guide button** — open style reference dialog
- **Include images button** — toggle AI image generation (purple when active, checked by default)

Tracks `activeImages` (generated images from previous turns) and sends them with each generation request for color coherence.

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

Upstash Redis store keyed by nanoid. Stores published form HTML and formId with a 7-day TTL.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google AI Studio API key |
| `BLOB_READ_WRITE_TOKEN` | Yes | Vercel Blob authentication token for image uploads |
| `KV_REST_API_URL` | Yes | Upstash Redis REST URL |
| `KV_REST_API_TOKEN` | Yes | Upstash Redis auth token |
| `KV_REST_API_READ_ONLY_TOKEN` | Yes | Upstash Redis read-only token |
