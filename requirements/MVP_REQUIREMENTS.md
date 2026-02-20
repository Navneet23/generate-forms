# Forms AI Restyler — MVP Requirements

## Overview

A web tool that lets Google Form creators generate a custom-styled responder UI for any public Google Form using natural language prompts. Responses are routed back to the original Google Form's response sheet. No Google authentication required from the creator.

---

## User Personas

- **Form Creator**: The person who owns the Google Form and wants to make it look better.
- **Respondent**: The person who fills out the custom-styled form via a shared URL.

---

## User Flow

```
1. Creator pastes a public Google Form URL into the tool
2. Tool scrapes the form structure server-side
3. Tool renders the original Google Form in an iframe as the baseline preview
4. Creator types a styling prompt in the chat panel
5. AI generates a new HTML/CSS/JS page for the form
6. Preview pane replaces the iframe with the AI-generated form
7. Creator iterates via chat until satisfied
8. Creator clicks "Publish" → a shareable URL is created
9. Respondents visit the shareable URL → see the custom-styled form
10. On submit, responses are proxied to the original Google Form
11. Responses appear in the original Google Sheet
```

---

## Core Features

### 1. Form Scraper

- Accept a public Google Form URL as input
- Make a server-side GET request to the URL (avoids CORS)
- Extract `FB_PUBLIC_LOAD_DATA_` from the page HTML
- Parse and normalize into a clean form structure:
  - Form title and description
  - Per question: text, type, answer options (if applicable), entry ID, required flag
  - Section/page breaks
- Surface a clear error if the form is not publicly accessible

**Supported question types for MVP:**

| Google Type Code | Question Type |
|---|---|
| 0 | Short answer |
| 1 | Paragraph |
| 2 | Multiple choice |
| 3 | Checkboxes |
| 4 | Dropdown |
| 5 | Linear scale |
| 9 | Date |
| 10 | Time |

**Out of scope for MVP:** Multiple choice grid, checkbox grid, file upload.

---

### 2. Baseline Preview

- Embed the original Google Form directly in an iframe in the preview pane
- This is what the creator sees before any AI generation
- No custom rendering needed — the real Google Form serves as the visual baseline
- Once the creator sends their first prompt and AI returns output, the iframe is replaced with the AI-generated form

---

### 3. Chat Panel (AI Styling Interface)

- Text input for creator to enter styling prompts
- Each prompt sends to the AI:
  - Normalized form structure (as context)
  - Creator's prompt
  - Previously generated HTML (for iterative refinement)
- AI returns a complete, self-contained HTML page (HTML + inline CSS + inline JS)
- Conversation history preserved within a session so creator can iterate
- "Regenerate" button to retry the last prompt if output is unsatisfactory

**Example prompts the system should handle:**
- "Make it dark mode with a minimal aesthetic"
- "One question at a time, with smooth transitions between questions"
- "Brand it with purple and gold colors, serif fonts"
- "Make it look friendly and casual for a team survey"

---

### 4. Preview Pane

- Initially shows the original Google Form in an iframe (baseline)
- After first AI generation, switches to rendering the AI-generated HTML in a sandboxed iframe
- Updates on every subsequent AI response
- Sandboxed to prevent generated JS from accessing the parent page
- Toggle between desktop and mobile preview widths

---

### 5. Publish & Hosting

- "Publish" button freezes the current AI-generated HTML
- Stores the frozen HTML on the server
- Returns a unique shareable URL: `yourapp.com/f/{unique-id}`
- All respondents visiting that URL are served the same frozen HTML
- Creator can copy the URL directly from the tool
- A creator can re-publish (generates a new URL; old URL remains valid)

---

### 6. Submission Proxy

- The generated form's submit action POSTs to your server, not directly to Google
- Your server maps submitted field values to the correct `entry.XXXXXXXXX` IDs
- Your server POSTs to:
  ```
  https://docs.google.com/forms/d/e/{formId}/formResponse
  ```
- On success: show a thank-you message to the respondent
- On failure: show a generic error message; log the failure server-side
- Entry ID mapping is stored at publish time alongside the frozen HTML

---

## UI Layout

```
┌──────────────────────────────────────────────────────────────┐
│  [Google Form URL input]              [Load Form]            │
├─────────────────────────────┬────────────────────────────────┤
│                             │                                │
│      PREVIEW PANE           │        CHAT PANEL              │
│                             │                                │
│  Initially: original        │  > Make it dark mode           │
│  Google Form in iframe      │  < [AI generates new form]     │
│                             │                                │
│  After first prompt:        │  > One question at a time      │
│  AI-generated form          │  < [AI refines output]         │
│                             │                                │
│  [Desktop] [Mobile]         │  [Type a prompt...]  [Send]    │
├─────────────────────────────┴────────────────────────────────┤
│  [Publish]    Shareable URL: yourapp.com/f/abc123   [Copy]   │
└──────────────────────────────────────────────────────────────┘
```

---

## Technical Components

| Component | Responsibility |
|---|---|
| **Scraper** (server-side) | GET form URL → parse `FB_PUBLIC_LOAD_DATA_` → return normalized JSON |
| **Structure normalizer** | Maps Google type codes to readable schema for AI prompt |
| **AI prompt layer** | Constructs prompt with form structure + user message → calls LLM → returns HTML |
| **Preview renderer** | Sandboxed iframe that renders AI-generated HTML; initially shows original form iframe |
| **Publish store** | Saves frozen HTML + entry ID map keyed by unique ID |
| **Static server** | Serves frozen HTML at `yourapp.com/f/{id}` |
| **Submission proxy** | Receives POST from custom form → proxies to Google formResponse endpoint |

---

## Known Limitations (Accepted for MVP)

| Limitation | Reason accepted |
|---|---|
| Only works with fully public Google Forms | Avoids OAuth requirement |
| `FB_PUBLIC_LOAD_DATA_` is undocumented | Acceptable fragility for a prototype |
| No sync if original form is edited after publish | Out of scope; creator must re-publish |
| No conditional logic / skip logic support | Parsing undocumented branching rules is too complex for MVP |
| File upload questions not supported | Requires Google Drive session; not feasible |
| Grid question types not supported | Deferred to post-MVP |
| Submission proxy may fail if Google rate-limits or adds CAPTCHA | Acceptable risk for prototype scale |
| Generated HTML not guaranteed to be accessible | Known risk, explicitly deferred |
| Generated HTML not security-audited | Known risk, explicitly deferred |

---

## Out of Scope for MVP

- Creator authentication / accounts
- Saving or managing multiple forms in a dashboard
- Custom domains for shareable URLs
- Analytics on form views or completion rates
- Themes library / saved templates
- AI generating new question types (question types are fixed to Google Forms' set)
- Editing form content (question text, options) — styling only
- Mobile app

---

## Success Criteria for MVP

- A creator can paste a public Google Form URL and see the original form previewed within 3 seconds
- A creator can generate a styled form from a text prompt within 15 seconds
- A creator can iterate at least 3 times in a session without losing context
- A published URL reliably serves the same form to all respondents
- At least 80% of submissions successfully route to the original Google Sheet in testing
- Supports all 8 question types listed above without rendering errors
