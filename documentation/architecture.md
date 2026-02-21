# Architecture — Forms AI Restyler MVP

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling (tool UI) | Tailwind CSS |
| AI Model | Gemini 2.0 Flash (`@google/generative-ai`) |
| Storage | In-memory Map (server-side, lost on restart) |
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
│   │   ├── generate/route.ts           # Calls Gemini, returns HTML
│   │   ├── publish/route.ts            # Freezes HTML, returns shareable URL
│   │   └── submit/[formId]/route.ts    # Proxies submissions to Google Forms
│   └── f/[id]/route.ts                 # Serves frozen published form HTML
├── components/
│   ├── UrlBar.tsx                      # URL input + Load Form button
│   ├── PreviewPane.tsx                 # iframe preview (baseline + AI-generated)
│   └── ChatPanel.tsx                   # Chat UI, triggers generation
└── lib/
    ├── scraper.ts                      # Extracts + normalises FB_PUBLIC_LOAD_DATA_
    ├── gemini.ts                       # Gemini prompt layer
    └── store.ts                        # In-memory published form store
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

### 2. AI Generation
```
Creator types prompt → POST /api/generate
    → Sends: FormStructure + prompt + conversation history + previous HTML
    → Gemini returns complete self-contained HTML page
    → Preview pane replaces original iframe with AI-generated srcdoc iframe
```

### 3. Publish
```
Creator clicks Publish → POST /api/publish
    → Server assigns nanoid, stores HTML + formId in memory
    → Returns shareable URL: /f/{id}
    → GET /f/{id} serves frozen HTML as text/html
```

### 4. Submission
```
Respondent submits form → POST /api/submit/{formId}  (from generated form JS)
    → Server maps entry.XXXXXXXXX fields to URLSearchParams
    → Server POSTs to https://docs.google.com/forms/d/e/{formId}/formResponse
    → Treats HTTP 200 or 302 as success
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
| 3 | checkboxes |
| 4 | dropdown |
| 5 | linear_scale |
| 9 | date |
| 10 | time |

Unsupported types (grids, file upload) are silently skipped.

---

### `lib/gemini.ts`

Wraps the Gemini API. Builds a system prompt with the form structure and rules, then starts a chat session with conversation history for iterative refinement.

**Model:** `gemini-2.0-flash`

**System prompt rules enforced:**
1. Output raw HTML only — no markdown, no code fences
2. All CSS inline in `<style>` tag
3. All JS inline in `<script>` tag
4. All inputs use exact `entry.XXXXXXXXX` name attributes
5. Submit via fetch POST to the proxy URL; if multi-step, collect all values across all steps before submitting
6. Fully responsive
7. Always render form title and description at the top
8. Required field validation before submit
9. Linear scale: single horizontal row of radio buttons with labels under min/max values
10. Multi-step review pages must show actual entered values, not placeholder text

**Conversation history:** last 10 turns are sent with each request for iterative refinement.

---

### `app/api/submit/[formId]/route.ts`

Proxies form submissions server-side to avoid CORS issues. Also handles preflight (`OPTIONS`) requests explicitly since the generated form runs in a `srcdoc` iframe which has a `null` origin — browsers send CORS preflight for cross-origin fetch even when destination is localhost.

All responses include:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

---

### `lib/store.ts`

In-memory `Map` keyed by nanoid. Stores published form HTML and formId. Data is lost on server restart — acceptable for MVP prototype. Replace with Redis or a database for production.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google AI Studio API key |
