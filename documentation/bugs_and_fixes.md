# Bugs and Fixes Log

## Bug 1 — Published URL doubled the origin

**Symptom:** Copied URL was `http://localhost:3000http://localhost:3000/f/abc123`

**Root cause:** The publish API returns the full URL (including origin). The frontend was also prepending `window.location.origin` before displaying and copying it, resulting in a double prefix.

**Fix:** Use `publishedUrl` directly in the display and clipboard copy. Remove the `window.location.origin` prefix from the frontend.

**File:** `app/app/page.tsx`

---

## Bug 2 — Form title showing as "C", description as "u"

**Symptom:** The AI-generated form showed a large "C" as the title and "u" as the description instead of the actual form title and description.

**Root cause:** Two compounding issues:

1. **Wrong scraper regex** — The original regex `\[[\s\S]*?\]` used a non-greedy quantifier. In a deeply nested JSON array, this stopped at the very first `]` encountered (closing an inner array), capturing only a tiny fragment of the data. The bracket-depth walker was not yet in place.

2. **Wrong index mapping** — The normaliser used `meta[8][0]` for title and `meta[8][1]` for description. After inspecting the live form's actual `FB_PUBLIC_LOAD_DATA_`, the correct mapping is:
   - Title: `meta[8]` (a plain string, not an array — indexing `[0]` on a string returns the first character, hence "C")
   - Description: `meta[0]` (a plain string)

**Fix:**
- Replaced regex with bracket-depth walker in `scrapeForm()`
- Updated normaliser to use `meta[8]` and `meta[0]` directly

**File:** `lib/scraper.ts`

---

## Bug 3 — Form submission failing from preview pane

**Symptom:** Clicking Submit in the preview pane showed "An error occurred. Please try again."

**Root cause:** The AI-generated form runs inside a `srcdoc` iframe. Content served via `srcdoc` has a `null` (opaque) origin in the browser. When that content makes a `fetch()` to `http://localhost:3000/api/submit/...`, the browser sends a CORS preflight request. Next.js API routes do not add CORS headers by default, so the preflight was rejected, causing the fetch to fail.

**Fix:** Added explicit CORS headers to all responses from `/api/submit/[formId]/route.ts`, including an `OPTIONS` handler for preflight requests:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

**File:** `app/app/api/submit/[formId]/route.ts`

---

## Bug 4 — Linear scale question rendering misaligned

**Symptom:** Linear scale labels (e.g. "Novice/Never Baked", "Expert/Professional") appeared on a separate row above the radio buttons, offset from the numbers.

**Root cause:** The AI was not given explicit instructions on how to render linear scale questions and generated inconsistent layout.

**Fix:** Added rule 9 to the system prompt:
> "For linear_scale questions, render them as a single horizontal row of numbered radio buttons. The min label appears below the lowest number and the max label appears below the highest number. Labels and numbers must be aligned in one clean row."

**File:** `lib/gemini.ts`

---

## Bug 5 — Next.js dev indicator "N" visible in UI

**Symptom:** A dark circular badge with "N" appeared overlapping the Publish button in development mode.

**Root cause:** Next.js 16 shows a dev mode indicator by default.

**Fix:** Set `devIndicators: false` in `next.config.ts`.

**File:** `next.config.ts`

---

## Bug 6 — Form submission returning 500 after multi-step form submit

**Symptom:** Clicking Submit on the final review page of an AI-generated multi-step form returns HTTP 500 from `/api/submit/[formId]`.

**Root cause (confirmed via browser investigation):** The proxy itself was not at fault. The failure was caused by two issues in the AI-generated form's JavaScript:

1. **Checkbox values sent as a comma-joined string** — the AI was not explicitly told to send checkbox selections as an array. Some generated forms sent `"Option A,Option B"` as a single string instead of `["Option A", "Option B"]`. Google Forms requires a separate `URLSearchParams` entry per selected option; the comma-string was rejected.

2. **Opaque redirect misread as failure** — Google Forms responds to a successful `formResponse` POST with an HTTP 302 redirect. When fetched with `redirect: "manual"`, the browser reports this as status `0`. The proxy was treating `0` as an error.

**Fix:**
- Proxy: body type changed to `Record<string, string | string[]>`; arrays appended individually to `URLSearchParams`
- Proxy: status `0` now treated as success alongside 200 and 302
- Proxy: empty/null/undefined values skipped
- System prompt rule 5 updated: explicitly instructs AI to send checkbox values as a JSON array of strings
- System prompt improved server-side error logging retained for future diagnosis

**Status:** Resolved

**Files:** `app/app/api/submit/[formId]/route.ts`, `app/lib/gemini.ts`

---

## Bug 7 — Screenshot overlay blocking form interaction in preview

**Symptom:** After the first AI generation, the creator could not click, scroll, or interact with the form in the preview pane at all. Every hover showed a crosshair cursor.

**Root cause:** The screenshot selection overlay (`position: absolute; inset: 0`) was always rendered on top of the AI-generated iframe, capturing all mouse events. There was no way to interact with the form without first removing or disabling the overlay.

**Fix:** Made screenshot mode opt-in. The overlay is now only rendered when the creator explicitly activates it by clicking the crop icon button in the chat toolbar. While inactive, the iframe receives all mouse events normally. After a screenshot is captured (or Escape is pressed), the overlay deactivates automatically.

- Removed the always-on overlay from `PreviewPane`
- Added `screenshotMode: boolean` prop; overlay only mounts when `true`
- Added crop icon button to `ChatPanel` toolbar (visible only when a generated form exists); toggles `screenshotMode` in `page.tsx`
- Preview toolbar hint text only shown when screenshot mode is active

**Files:** `app/components/PreviewPane.tsx`, `app/components/ChatPanel.tsx`, `app/app/page.tsx`

---

## Bug 8 — AI-generated multi-step forms: missing review step, no auto-advance, white background

**Symptom:** Three related issues observed in question-by-question generated forms:
1. The review step was sometimes skipped or rendered empty with no answer values
2. Single-selection questions (dropdown, multiple choice, linear scale) required an extra "Next" button click after selecting — slow and unintuitive
3. Generated forms had a plain white page background, not matching any intended style

**Root cause:** The system prompt did not include explicit rules for these behaviours, so the AI produced inconsistent results.

**Fix:** Added rules 11 and 12 to the system prompt in `lib/gemini.ts`:
- Rule 11: Page must fill full viewport (`min-height: 100vh`) with a background colour
- Rule 12a: Review step is mandatory in all question-by-question layouts — no exceptions
- Rule 12b: Single-selection questions (multiple_choice, dropdown, linear_scale) must auto-advance on selection
- Rule 12c: Auto-advance steps must show helper text ("Select an option to continue")
- Rule 12d: Multi-select/text questions still use an explicit Next button
- Rule 12e: Pressing Enter on any step advances to the next step (except inside `<textarea>`)

**File:** `app/lib/gemini.ts`
