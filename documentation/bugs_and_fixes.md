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

**File:** `app/api/submit/[formId]/route.ts`

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

## Bug 6 — Form submission returning 500 after multi-step form submit (in progress)

**Symptom:** Clicking Submit on the final review page of an AI-generated multi-step form returns HTTP 500 from `/api/submit/[formId]`.

**Root cause (suspected):** The AI-generated form may send checkbox field values as a JSON array (e.g. `["Option A", "Option B"]`) or as `null`/empty string for unanswered checkboxes. The original proxy typed the body as `Record<string, string>` and passed all values directly to `URLSearchParams`, which stringifies arrays as `"Option A,Option B"` instead of appending each value separately — Google Forms requires a separate entry per selected option.

A secondary suspect is that Google Forms returns an unexpected HTTP status code for certain submissions (e.g. an opaque redirect with status `0`), which the proxy was treating as failure.

**Partial fix applied:**
- Changed body type to `Record<string, string | string[]>`; array values are now appended individually to `URLSearchParams` (correct format for checkboxes)
- Empty/null/undefined values are skipped rather than sent as empty strings
- Status `0` (opaque redirect from `redirect: "manual"`) is now treated as success alongside 200 and 302
- Improved server-side error logging: Google's response body (first 500 chars) is now logged when an unexpected status is received

**Status:** Issue persists — root cause not yet fully confirmed. Server-side logs should now surface the exact Google response on next reproduction.

**File:** `app/app/api/submit/[formId]/route.ts`
