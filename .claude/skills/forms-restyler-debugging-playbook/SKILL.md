---
name: forms-restyler-debugging-playbook
description: Load when something in the Forms AI Restyler repo is broken and you need to triage it — form loading/scraping errors ("could not extract", empty questions), generation stream problems (stuck timeline, "Connection lost", SSE errors), missing or failed image generation, submit failures (form appears to submit but the Google Sheet doesn't update, CORS/OPTIONS errors), publish/persist bugs (wrong TTL, "form not found" after days), a wedged `npm run dev` on port 3000, eval pipeline failures (OAuth 403, `setPublishSettings is not a function`, verify step rejecting a published form), or mobile-only rendering bugs. Gives a symptom-to-fix triage table plus per-area discriminating checks.
---

# Forms AI Restyler — Debugging Playbook

A symptom-first runbook for this repo's real, previously-hit failure modes. Each
section names the file to read, the discriminating check to run, and the fix (or
the reason it isn't a bug). Every incident referenced here has a one-paragraph
story with a cross-reference to `forms-restyler-failure-archaeology` for the full
chronicle — read that skill if you want the "how we found it" narrative rather
than just the fix.

Two jargon terms used throughout: **SI** = the system instruction string built by
`buildSystemPrompt()` in `app/lib/gemini.ts` — the prompt that tells Gemini how to
restyle a form. **FormStructure** = the scraped representation of a source Google
Form (title, description, questions, `entry.XXXXXXXXX` field names, options) —
the thing generated HTML must reproduce verbatim.

## When NOT to use this skill

- Making or reviewing a change (SI edit, route edit, merge, deploy, anything that
  writes to Redis/Blob/Drive) → `forms-restyler-change-control`.
- Writing or tuning the SI itself → `forms-restyler-si-engineering`.
- Running the eval pipeline end-to-end (not just diagnosing a failure in it) →
  `forms-restyler-eval-pipeline`.
- You want the full narrative behind an incident, not just the fix →
  `forms-restyler-failure-archaeology`.
- The specific, open, non-deterministic question-text-drift problem (INC-9) as a
  project — this playbook tells you it exists and what NOT to do about it, but
  the active work is tracked in `forms-restyler-drift-elimination-campaign`.
- You need Google Forms wire-format details (FB_PUBLIC_LOAD_DATA_ field indices,
  `entry.*` semantics) beyond what's needed to triage → `google-forms-internals-reference`.
- You want to understand overall system shape rather than fix something broken →
  `forms-restyler-architecture-contract`.

## Master triage table

| Symptom | Likely cause | Discriminating check | Fix section |
|---|---|---|---|
| "Could not find form data" / "Please provide a valid Google Form URL" | Form isn't public, or URL isn't a `docs.google.com/forms` link | `curl -s <url> \| grep -c FB_PUBLIC_LOAD_DATA_` | §1 |
| Scrape succeeds but questions are missing/fewer than expected | Unsupported question type (grid/file-upload) silently dropped | Compare question count in the live form vs. `FormStructure.questions.length` from `/api/scrape` | §1 |
| Generation timeline stalls on one step forever | Slow/hung Gemini call, or client gave up reading the stream | Check server log (`app/debug.log` locally) for the last `[GEMINI]` line vs. what the UI shows | §2 |
| "Connection lost during generation" in the UI | SSE stream ended before a `result` event arrived (network drop, serverless timeout) | Same as above — did the server log show a `result` being sent? | §2 |
| Generated question text or option labels don't exactly match the source form | Known, open, non-deterministic drift (INC-9) | Diff generated `<label>`/`<option>` text against `structure.questions[].text` | §2 |
| Image generation fails with a numeric code (429/503) | Gemini image model rate limit or transient outage | `ImageGenError.code` in the `imageErrors` array on the `result` SSE event | §3 |
| A form has zero images in the generated output | Often intended — SI tells Gemini plain surveys don't need images | Check the `plan` step's `detail` (the announced plan) for whether images were even considered | §3 |
| Generated form "submits" but the Google Sheet never gets a row | Google Forms rejected the POST (wrong `entry.*` name, bad option value, or CORS block never even reached your proxy) | `curl` the proxy route directly (recipe in §4) and read the response body | §4 |
| Browser console shows a CORS/preflight error on submit | `srcdoc` iframe has a null origin; some deployment or edit removed the OPTIONS handler | Check `app/app/api/submit/[formId]/route.ts` still exports `OPTIONS` | §4 |
| "Form not found" (404) hitting a published `/f/<id>` link days after publishing | TTL expired (30-day default) and `extend` was never called | `GET`/inspect the Redis key's TTL, or check whether `/api/forms/[id]/extend` was ever hit | §5 |
| Publish/extend throws at startup or on first request, env-var-shaped error | Missing `publish_KV_REST_API_URL`/`KV_REST_API_URL` (or token) in `.env.local` | `grep -c KV_REST_API app/.env.local` | §5 |
| `next dev` won't start, or starts but requests hang / port 3000 already in use | Stale dev server process still holding the port and `.next` lock | `lsof -ti :3000` | §6 |
| A background shell can't find `app/` files or runs the wrong `npm` script | Background shell's cwd defaulted to `app/` instead of repo root (or vice versa) | `pwd` at the top of the failing script/log | §6 |
| Eval OAuth flow: `Error 403: access_denied`, survives adding test users / publishing consent screen | `client_secret.json` belongs to a different GCP project than the consent screen | Diff the client id in `evals/tools/credentials/client_secret.json` against Cloud Console's client list | §7 |
| `TypeError: forms.forms.setPublishSettings is not a function` | `googleapis` package predates the publish-settings endpoint | `grep googleapis evals/tools/package.json` — need `^173` or newer | §7 |
| Eval `verify` stage fails claiming a question is "missing from public payload" | `&`/`<`/`>` in question text got escaped differently than the literal check expected | Confirm the missing text actually contains `&`, `<`, or `>` | §7 |
| `recreate` stage throws `question N (multiple_choice) needs >= 2 options` | Gemini emitted a 1-option consent-style item as `multiple_choice`/`dropdown` instead of `checkboxes` | Look at the offending question's inferred type in the recreate output | §7 |
| Eval item flagged `thinExtraction` in the manifest | Single-question-per-screen SPA (Typeform/Fillout/Paperform) only rendered its welcome screen to Puppeteer | Check `evals/manifest-items/<id>.json` for `thinExtraction: true` | §7 |
| Form looks fine on desktop, broken on mobile (huge text, big empty gaps) | Likely MULTIPLE independent causes at once — do not stop at the first one you find | Walk all four checks in §8 before patching anything | §8 |

## 1. Form loading / scraping failures

Code: `app/lib/scraper.ts` (parsing), `app/app/api/scrape/route.ts` (the `/api/scrape`
POST endpoint that calls it).

How scraping works: `scrapeForm()` fetches the form's `viewform` HTML with a
browser-like User-Agent, locates the literal string `FB_PUBLIC_LOAD_DATA_ = ` in
the page, then walks the following JSON array character-by-character tracking
`[`/`]` bracket depth to find the matching close bracket — this is a deliberate
choice over a regex, because a non-greedy regex would stop at the first `]` it
finds inside the payload, truncating the structure. The array is then `JSON.parse`d
and `normalise()`d into a `FormStructure`.

Failure points, in the order the code hits them:

1. **"Could not find form data. Make sure the form is public and the URL is a
   valid Google Form."** — thrown when `FB_PUBLIC_LOAD_DATA_ = ` isn't in the
   fetched HTML at all. Two real causes look identical here: the form's sharing
   setting is not "Anyone with the link can respond" (Google serves a login wall
   instead), or the URL isn't actually a form response page. Discriminate with:
   ```
   curl -s -A "Mozilla/5.0" "<the form URL>" | grep -o "FB_PUBLIC_LOAD_DATA_" | head -1
   ```
   No output → form isn't public (or URL is wrong). Also check for
   `accounts.google.com` in the fetched HTML — that's the login-wall signature.
2. **"Failed to extract form data."** — the bracket walker ran off the end of the
   string without depth returning to 0. This means Google changed the page format
   in a way the walker doesn't handle; treat as a real bug, not a config issue.
3. **"Failed to parse form data."** — `JSON.parse` threw on the extracted slice.
   Same class as above: the extracted boundaries were wrong.
4. **Scrape succeeds, but fewer questions come back than the live form has.**
   `TYPE_MAP` in `scraper.ts` only maps type codes 0, 1, 2, 3, 4, 5, 9, 10 (short
   answer, paragraph, multiple choice, dropdown, checkboxes, linear scale, date,
   time). Any other type code — grid/multiple-choice-grid, checkbox-grid, file
   upload, ranking — resolves to `"unknown"` and is **silently skipped** in the
   `for (const q of rawQuestions)` loop (`if (type === "unknown") continue;`).
   There is no warning, no count in the response, nothing — the caller has no way
   to know a question was dropped short of counting questions themselves. If a
   scrape looks "thin," open the source form and check for a grid or file-upload
   question before assuming anything else is wrong.

`/api/scrape/route.ts` itself only validates that `url` is a string containing
`docs.google.com/forms`; all format/content errors above bubble up from
`scrapeForm()` as a 500 with the thrown message as `error`.

## 2. Generation issues (the SSE stream)

Code: `app/app/api/generate/route.ts` (the streaming endpoint), `app/lib/gemini.ts`
(`generateForm()`, the actual Gemini call and function-calling loop), and the
consumer in `app/components/ChatPanel.tsx` (`getReader()` loop, ~line 293 onward)
for how the UI interprets the stream.

**Stream anatomy.** `/api/generate` returns `text/event-stream`; every event is a
line `data: {json}\n\n`. Three event shapes:
- `{ type: "step", step, status: "started"|"completed"|"failed", detail?, imageType?, imageIndex?, imageCount? }`
- `{ type: "result", html, generatedImages, imageErrors? }` — final event, only
  event that carries the HTML
- `{ type: "error", message }` — unrecoverable failure; the client throws
  `new Error(event.message)` on receipt

Steps fire in order: `analyze` → `plan` → `image_gen`* (repeated per image, if
any) → `color_match`* (only if at least one image was generated) → `html_gen`.
The `plan` step's `completed` event carries Gemini's own announced visual plan in
`detail` (from the mandatory `announce_plan` function call) — this is your
window into what Gemini decided to do before you see the HTML.

**Stuck timeline.** If a step shows `started` and never reaches `completed`/`failed`
in the UI, the generation is still running server-side (large HTML, retried image
calls) or the SSE connection dropped without the browser noticing yet. Check
`app/debug.log` (local dev only — gated by `IS_LOCAL = !process.env.VERCEL` in
`gemini.ts`) for the most recent `[GEMINI]` line; if it's mid-function-call, the
model is still working. Only `GEMINI_API_KEY`-authenticated calls without a
`result` event ever produce this; there is no server-side generation timeout in
the route itself, so a wedged Gemini call can hang until the platform's own
request timeout kills it.

**"Connection lost during generation."** This exact string comes from
`ChatPanel.tsx`: the reader's `while (true) { read() }` loop exited (`done: true`)
without ever setting `receivedResult = true`. That means the HTTP response ended
before a `result` event was sent — most commonly a serverless function timeout on
a long generation, or the client's own network dropping. The UI's own guidance is
correct: "Regenerate last response" retries from the same history; nothing on the
server needs cleanup because nothing was persisted (persistence only happens at
publish).

**Fatal vs. per-step failures — do not confuse these:**
- A `step` event with `status: "failed"` (currently only emitted for
  `image_gen`) is **non-fatal** — the loop continues, the image is skipped, its
  error is collected into `imageErrors`, and generation proceeds to `html_gen`
  and still emits a `result`.
- A top-level `type: "error"` event is fatal — thrown from the outer `catch` in
  `/api/generate/route.ts` (e.g. `GEMINI_API_KEY is not set`, or an uncaught
  exception from `generateForm()`) and the stream closes with no `result` at all.

**Question-text drift (INC-9, OPEN).** Gemini occasionally paraphrases question
text or option labels despite the SI's explicit verbatim-text rules — e.g. "Rate
your current baking/decorating experience." rendered as "Rate your current
experience." It's non-deterministic and infrequent; a retry of the same prompt
usually produces correct output. Commit f5599da already strengthened the SI's
verbatim-text language and reduced — but did not eliminate — the rate; treat
further prompt-only tweaks as a known-weak path, not a real fix. The structural
fix under discussion is a post-generation validator that diffs generated
question/option text and `entry.*` names against `structure.questions[]` and
auto-retries on mismatch — tracked in `forms-restyler-drift-elimination-campaign`,
not this playbook. If you hit this while debugging something else, don't chase
it — confirm it's drift (generated text is a close paraphrase, not garbage) and
move on, or file it under that campaign.

## 3. Image generation failures

Code: `app/lib/image-gen.ts` (`generateImage()`, called directly from
`generateForm()`'s function-calling loop in `gemini.ts` — never via internal
HTTP self-fetch, see INC-13 below).

Every image call can fail in three ways, all surfaced as `ImageGenError`:
- **No `GEMINI_API_KEY`** — thrown before any network call.
- **Gemini SDK error** — `ImageGenError.fromError()` regex-parses SDK error
  strings shaped like `[429 Too Many Requests] ...` or `[503 Service
  Unavailable] ...`, extracting the numeric `code` and a cleaned `message`. This
  is what lets the UI show "Image generation failed (429): ..." per image.
- **Model returned text only** — `"No image generated — model returned text
  only"` when the response has no `inlineData` part with an `image/*` MIME type.

None of these abort the whole generation: `gemini.ts`'s function-calling loop
`catch`es the error, pushes `{ code, message }` onto `imageErrors`, sends Gemini
a `functionResponse` with `success: false`, and continues — the form still gets
HTML and a `result` event, just with fewer (or zero) images and populated
`imageErrors`.

**Transient 503s (INC-17).** During the 68-generation eval batch, 2 generations
hit `503 Service Unavailable` from the image model. Re-running the exact same
command resumed cleanly (the eval tooling is shard/manifest-driven — see
`forms-restyler-eval-pipeline`) and succeeded on retry. This is expected Gemini
API flakiness, not a code bug — don't spend time root-causing an isolated 503.

**Zero images is sometimes correct (INC-18).** 5 of 34 eval items produced zero
images in both image-model configs during the eval batch (count verified against
`evals/manifest.json`, 2026-07-19) — the SI's own guidance
(`buildSystemPrompt()`'s "IMAGE GENERATION GUIDELINES" block) tells Gemini that
plain surveys/internal forms are poor candidates for images and it's allowed to
decide not to call `generate_image` at all. Before treating a zero-image result
as a bug, read the `plan` step's announced summary — if it explicitly reasons
about not needing images, that's working as intended, not a failure.

**Historical note — INC-13, self-fetch 401s.** Vercel preview deployments have
deployment protection that 401s unauthenticated internal requests. An earlier
version of `/api/generate` called `fetch("/api/generate-image")` as a separate
internal HTTP hop and got 401'd on preview URLs. Fixed by importing
`app/lib/image-gen.ts` directly instead of self-fetching between routes — if you
ever see a 401 that only reproduces on a Vercel preview URl (not prod, not
local), suspect a reintroduced internal self-fetch first.

## 4. Submission failures

Code: `app/app/api/submit/[formId]/route.ts` — the proxy that generated forms
POST to, which relays the response into the real Google Form via
`https://docs.google.com/forms/d/e/{formId}/formResponse`.

**Why a proxy exists at all (INC-14).** Generated forms are rendered inside a
`srcdoc` iframe in the app UI, which gives the iframe document a null origin.
Browsers send a CORS preflight `OPTIONS` request even when the eventual target
is same-origin/localhost, because the null-origin iframe looks cross-origin. The
route handles this explicitly:
```ts
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
```
with `CORS_HEADERS` including `Access-Control-Allow-Origin: "*"` applied to
**every** response (success and error) — if you ever edit this route and a
response path forgets to spread `CORS_HEADERS` into its headers, iframe-embedded
forms will fail with a browser-level CORS error that never even reaches your
`catch` block or server logs.

**Request/response mapping to know:**
- Body is JSON: `{ "entry.XXXXXXXXX": value }`. Checkbox questions send an array
  of strings for one entry key; the route's mapping loop does
  `formData.append(key, v)` once per array element, producing Google's expected
  repeated-key form encoding for multi-select.
- Empty string / `null` / `undefined` values are dropped from the outgoing
  `formData` entirely (not sent as empty), matching how a real form omits
  unanswered optional fields.
- `formData.append("submit", "Submit")` is always added — required by Google's
  endpoint.
- The proxy fetches with `redirect: "manual"`. **Google Forms responds 200 on
  success in some configs and 302 (redirect to the "response recorded" page) in
  others; `status === 0` is also treated as success** because `redirect: "manual"`
  can produce an opaque `0` status for a cross-origin redirect that the runtime
  won't let you inspect. Any other status is reported back as a 500 with
  `googleStatus` and a truncated `sentBody` for debugging.

**Discriminating test — bypass the generated form's JS entirely:**
```bash
curl -i -X POST http://localhost:3000/api/submit/<formId> \
  -H "Content-Type: application/json" \
  -d '{"entry.123456789": "test value"}'
```
Read the JSON body: `{"status":"ok"}` means the proxy → Google leg works and the
bug is in the generated form's client-side JS (wrong `entry.*` name harvested
from a stale HTML, or a checkbox not sending an array). A 500 with `googleStatus`
present means Google itself rejected the payload — check that the `entry.*` name
and option value are byte-for-byte what `FormStructure` produced (rule 4 of the
SI requires `name="entry.XXXXXXXXX"` on every input, verbatim).

If the generated Sheet never gets a row despite `{"status":"ok"}` from `curl`,
that's not a bug in this route — it means the payload reached Google but Google
silently discarded a value it didn't recognize (wrong option string, wrong
`entry.*` id no longer matching the live form). Re-scrape the source form to
confirm entry IDs haven't drifted.

## 5. Publish / persist issues

Code: `app/app/api/publish/route.ts`, `app/lib/store.ts`, `app/app/api/forms/[id]/extend/route.ts`.

**Storage:** Upstash Redis, one key per published form (`nanoid(10)` id),
value is the JSON-stringified `PublishedForm` record. `store.ts` reads
connection env vars with a fallback pair:
```ts
url: process.env.publish_KV_REST_API_URL ?? process.env.KV_REST_API_URL
token: process.env.publish_KV_REST_API_TOKEN ?? process.env.KV_REST_API_TOKEN
```
i.e. a `publish_`-prefixed override wins if present, otherwise the plain
`KV_REST_API_*` vars are used. If publish/extend throws immediately (before any
network call reasonably could complete) or Redis calls fail cryptically, check
which of these four vars actually exist in `app/.env.local`:
```bash
grep -c "KV_REST_API" app/.env.local
```
Missing both members of a pair means `redis = new Redis({ url: undefined!, token: undefined! })`
at module load — every store call will fail.

**TTL semantics** — three tiers, all in `store.ts`:
| Tier | Duration | When applied |
|---|---|---|
| Default | 30 days | Every `save()` (fresh publish) |
| Extended | 365 days | `extendForm()` — called by `/api/forms/[id]/extend`; idempotent, returns the existing record unchanged if `extended` is already `true` |
| Legacy fallback | 7 days from `createdAt` | Only synthesized in `get()` for records written before the `expiresAt` field existed, to give old records *some* computed expiry rather than crashing |

A "form not found" 404 on a `/f/<id>` link that used to work means the Redis key
expired — either it was never extended past the 30-day default, or (rare) it was
extended and is now past the 1-year mark. There is no separate "check TTL"
endpoint; the only way to know a record's remaining life from outside Redis is
`record.expiresAt` in the last `/api/publish` or `/api/forms/[id]/extend`
response you captured.

**Legacy-record tolerance.** `get()` treats every field defensively (`raw.html ??
""`, `raw.imageKeys ?? []`, etc.) so that a record shaped by an older version of
`PublishedForm` doesn't crash the reader — if you extend `PublishedForm` with a
new required-feeling field, follow this pattern (default it in `get()`) rather
than assuming all stored records have it.

Remember DR-2 from change control: this Redis instance and Blob store are
**shared with production** — local publish/extend calls write real prod data.
See `forms-restyler-change-control` before running anything here as an
"experiment."

## 6. Dev environment

**Wedged port 3000 (INC-15).** A stale `next dev` process holds the port and the
`.next` dev lock; a fresh `npm run dev` either fails to bind or starts against a
stale build in a way that produces confusing errors (not "port in use," often
just hung requests or a build that never becomes ready). Fix:
```bash
lsof -ti :3000 | xargs kill
```
then restart `npm run dev` (in `app/`). If it still won't bind, also check for a
lock file under `app/.next/` and remove the stale `next dev` process by PID from
`lsof -i :3000` output if `xargs kill` didn't catch it (e.g. a different signal
was needed, or the process was owned by a different shell).

**Background-shell cwd trap (INC-20).** Background shells in this environment
have been observed starting in `app/` rather than the repo root. A script or
command that assumes repo-root cwd (e.g. anything referencing `evals/...` or
`app/...` relatively) can silently fail or target the wrong path. Always use
absolute paths, or an explicit `cd <absolute path> &&`, in anything run as a
background command — don't rely on inherited cwd.

## 7. Eval pipeline failures

Full operating instructions for the eval pipeline (running it end-to-end, the
manifest/shard model, pilot-first discipline) live in
`forms-restyler-eval-pipeline` — this section is diagnosis only.

**OAuth 403 `access_denied` that survives consent-screen fixes (INC-1).** The
downloaded `evals/tools/credentials/client_secret.json` can belong to a
*different* GCP project than the one whose OAuth consent screen you're editing —
adding test users or publishing the consent screen to production does nothing
because you're fixing the wrong project. Google's error message doesn't say
this. Diagnose by comparing client ids:
```bash
# client id embedded in the downloaded JSON:
grep -o '"client_id":"[^"]*"' evals/tools/credentials/client_secret.json
```
Then open Cloud Console → the project whose consent screen you intended to fix →
**APIs & Services → Credentials**, and check whether that same client id is
listed there. If it isn't, you downloaded the JSON from the wrong project — go
back to the correct project's Credentials page, create/download a **Desktop app**
OAuth client JSON from *that* project, overwrite `client_secret.json`, and
re-run `npm run auth`. `evals/tools/README.md` carries a warning for this
(⚠️ "The downloaded JSON must belong to the SAME project as the consent
screen").

**`TypeError: forms.forms.setPublishSettings is not a function` (INC-2).**
`googleapis@144` predates the Forms API's publish-settings endpoint used in
`evals/tools/lib/gforms.mjs`. Confirm the installed major version:
```bash
grep googleapis evals/tools/package.json
```
Needs `^173.0.0` or newer (per current `package.json`); if it's older, `npm
install googleapis@^173` in `evals/tools/`.

**Verify step rejects a published form as missing a question (INC-11).**
`evals/tools/lib/verify.mjs`'s `candidates()` generates encoding variants of each
question's text (raw, `JSON.stringify`-escaped, `\uXXXX`-escaped for `&`/`</>`,
and HTML-entity `&amp;`-escaped) before searching the fetched page — because
Google encodes `&`, `<`, `>` differently depending on whether the text lands
inside the inline JSON blob or an HTML attribute. If verify still reports a
question missing, first check whether that question's text contains one of
those three characters; if it does and verify still can't find it, the encoding
variant list is incomplete for whatever new context Google introduced — add the
missing variant rather than assuming the form itself is broken.

**`recreate` throws `question N (multiple_choice) needs >= 2 options` (INC-12).**
Gemini's recreation step sometimes emits a consent/acknowledgement item ("I
agree to the terms") as a 1-option `multiple_choice` or `dropdown`, but the
Google Forms API requires ≥2 options for those types (checkboxes tolerate a
single option). `evals/tools/lib/recreate.mjs` already coerces exactly this case
to `checkboxes` when it detects a 1-option `multiple_choice`/`dropdown` — if you
see this error, either that coercion didn't run (check the item's raw Gemini
recreation output for a different single-option type it doesn't cover yet, e.g.
`linear_scale` with one point) or Gemini invented a new shape the coercion
doesn't anticipate.

**Thin extraction (INC-10).** One-question-at-a-time SPA form builders
(Typeform, Fillout, Paperform) render only their welcome/first screen to
Puppeteer during extraction, so Gemini's recreation step infers a plausible
question set instead of transcribing the real one. 14/37 eval items are flagged
`thinExtraction: true` in their manifest shard; this was accepted by the user
(the eval's goal is "similar, not exact") but these items have the lowest source
fidelity — if you're auditing eval quality, start with the `thinExtraction`
items, not a random sample.

## 8. Mobile rendering issues — worked triage example (INC-7)

Use this as the template for "looks wrong on mobile" bugs generally, not just as
a historical note. Symptom: on narrow screens, the generated form's footer text
rendered oversized and the form card had large, unexplained empty white space.
The investigation took multiple hours because it kept looking "fixed" after each
individual patch — because there were **four independent root causes stacked on
top of each other**, and fixing one made the bug look different rather than gone:

1. The footer wordmark used relative (em) sizing, so it inherited whatever
   display-font scale the rest of the form used — a big display font meant a big
   footer wordmark.
2. SI rule 6's "text must be ≥16px on mobile" minimum was being applied
   indiscriminately, including to the footer/secondary notice text that should
   have stayed small.
3. Desktop padding/margin values were fixed pixel amounts reused unchanged on
   mobile instead of compressing for narrow viewports.
4. Step containers (in question-by-question layouts) used `min-height` and
   `justify-content: space-between`, so they stretched to fill available height
   and left a visible gap between the question and its Next button.

All four fixes now live in `app/lib/gemini.ts`'s SI text (`buildSystemPrompt()`),
verifiable directly:
- `buildGoogleFormsFooter()`'s inline styles are fixed px (`font-size:12px` for
  notices, `20px` for the wordmark), not em/relative units.
- Rule 6 explicitly exempts "secondary text like helper hints and the rule-18
  footer" from the 16px minimum, and requires 16–24px horizontal padding at
  ≤480px with compressed vertical gaps.
- Rule 18 repeats the exemption: "Keep the footer's inline font sizes exactly as
  given (12px notices, 20px wordmark) on ALL screen sizes... Do not let it
  inherit the page's display font."
- Rule 6 also requires cards/steps to size to content: "never give them fixed
  heights, large min-heights, or space-between stretching."

**The generalizable lesson:** when a mobile bug is reported as one visual
symptom ("footer looks huge," "there's a weird gap"), assume it is the visible
tip of several unrelated causes until you've actually enumerated candidates —
inspect computed font-size units, check whether a sizing rule is being
over-applied to text it shouldn't touch, check padding/margin literally by
viewport width, and check container sizing model (fixed height vs. content-sized)
— *before* landing a single patch and declaring victory. Full narrative in
`forms-restyler-failure-archaeology`.

## Provenance and maintenance

Written 2026-07-19. Sources: direct reads of `app/lib/scraper.ts`,
`app/app/api/scrape/route.ts`, `app/app/api/generate/route.ts`,
`app/lib/gemini.ts`, `app/lib/image-gen.ts`, `app/components/ChatPanel.tsx`,
`app/app/api/submit/[formId]/route.ts`, `app/app/api/publish/route.ts`,
`app/lib/store.ts`, `app/app/api/forms/[id]/extend/route.ts`,
`evals/tools/README.md`, `evals/tools/package.json`, `evals/tools/lib/verify.mjs`,
`evals/tools/lib/recreate.mjs`, `evals/tools/lib/gforms.mjs`, all on the
`si-improvements` branch; incident narratives (INC-1 through INC-20) are
canonicalized in `forms-restyler-failure-archaeology`, cross-checked against the
code above wherever they make a repo-checkable claim.

Re-verify the volatile facts above with:
```bash
grep -n "googleapis" evals/tools/package.json                 # INC-2 version floor
grep -n "TYPE_MAP" -A 12 app/lib/scraper.ts                    # supported question types
grep -n "publish_KV_REST_API\|KV_REST_API" app/lib/store.ts     # env var fallback pair
grep -n "TTL_SECONDS" app/lib/store.ts                          # TTL tiers
grep -n "CORS_HEADERS" -A 3 "app/app/api/submit/[formId]/route.ts"  # CORS handling still present
```
