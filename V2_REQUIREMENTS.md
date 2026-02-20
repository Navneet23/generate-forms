# Forms AI Restyler — V2 Requirements

## Overview

V2 builds on the MVP by giving form creators richer ways to communicate intent to the AI. Instead of relying solely on text prompts, creators can point at specific parts of the form, embed images directly, and provide visual style references — either via uploaded images or a website URL.

---

## New Features in V2

### 1. Screenshot Selection (Target a Specific Region for Editing)

Allows the creator to drag-select a region of the AI-generated form preview and attach it as visual context to their next chat message. This makes targeted edits significantly more accurate — instead of describing what to change in text, the creator can show it.

**Behavior:**
- Disabled at the start of a session (no AI-generated form exists yet)
- Enabled automatically after the first AI generation
- A selection overlay appears on the preview pane
- Creator drags to select a region → a thumbnail of that region is appended to the chat input
- Creator adds a text prompt alongside it (e.g. "make this section less cluttered")
- Both the image and text are sent to the AI as a multimodal input

**Does not work on the baseline preview** (original Google Form iframe is cross-origin; browser security prevents capturing its pixels).

**Implementation approach:**
- Selection overlay sits in the parent page above the iframe, tracking mouse events
- On selection, parent sends a postMessage to the iframe with region coordinates `{ x, y, width, height }`
- `html2canvas` runs inside the iframe on its own DOM (no cross-origin issues — it is your HTML)
- Iframe sends back a base64 image via postMessage
- Parent appends the thumbnail to the chat input field

---

### 2. Image Upload — Embed in Form (+ Button)

A **+** button in the chat input bar allows the creator to upload an image to be embedded directly in the form (e.g. a logo, header photo, or background image).

**Behavior:**
- Creator clicks **+** → file picker opens
- Uploaded image is sent to your server and hosted on a CDN
- A stable URL is returned and passed to the AI as context:
  `"The user has uploaded an image to embed in the form. It is hosted at: https://yourcdn.com/uploads/abc123.jpg. Use it in the form as directed."`
- Creator describes placement in their text prompt ("use this as a full-width header image", "add this as a logo in the top left")
- AI generates HTML referencing the hosted URL

**Storage requirement:** Images uploaded via **+** must be stored **permanently**. The hosted URL is baked into the published form's HTML and must remain accessible for as long as the form is live. Do not apply any TTL or automatic cleanup to these assets.

**Do not base64-inline images** in the generated HTML. A 2MB image becomes ~2.7MB of inline text, making the page slow to load and the HTML too large for the AI to work with reliably.

---

### 3. Style Guide

A dedicated **"Style guide"** button in the chat panel (separate from **+**) opens a dialog where the creator provides a visual reference for the AI to extract style from. The style guide image or screenshot is never embedded in the form — it is used solely as a reference input to the AI.

**Two input options in the dialog:**

#### Option A: Upload an image
- Creator uploads an image (brand asset, mood board, design screenshot)
- Sent directly to the AI as a vision input
- No hosting required — image is ephemeral, used only for the AI API call and then discarded
- AI extracts colors, typography feel, and aesthetic and applies them to the form

#### Option B: Provide a website URL
- Creator pastes a URL
- Your server uses a headless browser (Puppeteer/Playwright) or a commercial screenshot API to capture an above-the-fold screenshot of the website server-side
- Screenshot is sent to the AI as a vision input alongside the creator's prompt
- AI extracts the site's visual style and applies it to the form

**Dialog also includes an optional text field:**
`"Anything specific to focus on?"` — e.g. "just the color palette", "the card layout pattern", "typography only". This significantly improves AI output quality by narrowing what the AI should extract.

**Style guide persists for the session:** Once a style guide is applied, it is re-attached as context on every subsequent AI call for the remainder of the session. This prevents the AI from drifting away from the established style after several iterations.

---

## Updated UI Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  PREVIEW PANE                    │  CHAT PANEL                   │
│                                  │                               │
│  [Screenshot overlay active      │  [screenshot thumbnail]       │
│   after first generation]        │  > make this section          │
│                                  │    less cluttered             │
│  Drag to select a region  ─────► │  < [AI response]              │
│                                  │                               │
│                                  │  [image thumbnail]            │
│                                  │  > use this as header         │
│                                  │  < [AI response]              │
│                                  │                               │
│                                  │  ┌───────────────────────┐   │
│                                  │  │ [+] [Style guide]     │   │
│                                  │  │ [Type a prompt...] →  │   │
│                                  │  └───────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘

[+] opens:
  ┌──────────────────────┐
  │ 📎 Upload image      │  ← embeds image in form, hosted on CDN
  └──────────────────────┘

[Style guide] opens dialog:
  ┌────────────────────────────────────────┐
  │  Provide a style guide                 │
  │                                        │
  │  ○ Upload an image                     │
  │    [Drop image here or browse]         │
  │                                        │
  │  ○ Use a website                       │
  │    [https://...]         [Preview]     │
  │                                        │
  │  Anything specific to focus on?        │
  │  [e.g. "color palette and typography"] │
  │                                        │
  │                  [Apply]   [Cancel]    │
  └────────────────────────────────────────┘
```

---

## Risks and Mitigations

### Screenshot Feature

| Risk | Mitigation |
|---|---|
| Cannot screenshot cross-origin baseline iframe | Disable screenshot tool until after first AI generation; clearly communicate this |
| Sandboxed iframe blocking canvas operations | Use postMessage + html2canvas inside the iframe rather than from the parent |
| Overlay mouse tracking misaligned with iframe content | Translate parent-page coordinates to iframe-relative coordinates before sending via postMessage |

### Image Upload (+ Button / Embed)

| Risk | Mitigation |
|---|---|
| Large images make generated HTML too heavy if inlined | Always host on CDN and pass URL to AI; never base64 inline |
| Hosted image deleted while published form is still live | Permanent storage for embedded images; no TTL cleanup |
| Style guide image accidentally treated as embed | Strict separation: + button = embed only; Style guide = reference only |

### Style Guide — Image

| Risk | Mitigation |
|---|---|
| Style guide context lost after several chat iterations | Re-attach style guide image as context on every AI call for the session |
| AI makes wrong assumptions about which aspects of the style to apply | Optional "focus on" text field in dialog narrows AI interpretation |
| Style guide and embedded image are visually conflicting | Cannot fully prevent; set creator expectation that these should be complementary |

### Style Guide — Website URL

| Risk | Mitigation |
|---|---|
| Headless browser blocked by bot detection (Cloudflare, Akamai) | Use a commercial screenshot API (Screenshotone, Urlbox, Browserless) which handles this better; show a clear error if it fails |
| Cookie consent overlay covers the actual design in the screenshot | Accepted limitation for V2; noted in known limitations |
| JS-heavy SPAs capture a loading skeleton before hydration completes | Use `waitUntil: networkidle` in Puppeteer before capturing; add a short fixed delay as fallback |
| SSRF risk — user provides internal network URLs | Validate that the URL resolves to a public IP before making server-side request; reject private IP ranges (192.168.x.x, 10.x.x.x, localhost, etc.) |
| Creator unclear on what "style" means (colors? layout? fonts?) | Optional "focus on" text field in dialog |

---

## Storage Clarification

| Asset | Lifetime | Storage |
|---|---|---|
| + uploaded image (embed) | Permanent — as long as published form exists | CDN / object storage (S3, GCS, R2) with no automatic cleanup |
| Style guide image (upload) | Ephemeral — discard after AI API call | Temporary; do not persist |
| Website style guide screenshot | Ephemeral — discard after AI API call | Temporary; do not persist |
| Screenshot selection capture | Ephemeral — used for one AI call | Not stored; base64 passed directly in API request |

---

## Known Limitations (Accepted for V2)

| Limitation | Reason accepted |
|---|---|
| Screenshot only works after first AI generation | Cross-origin iframe restriction; unavoidable without major architecture change |
| Website style guide fails for sites with bot protection or cookie walls | Acceptable at V2 scale; show clear error messaging |
| No creator control over image sizing/positioning beyond text description | Layout precision deferred to V3 |
| Style guide and embedded image may produce conflicting aesthetics | AI quality issue; creator guidance in UI |
| Style guide applies to whole form, not individual sections | Section-scoped style guide deferred to V3 |
