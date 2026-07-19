---
name: forms-restyler-architecture-contract
description: Load before designing or reviewing any change to app/ code in the Forms AI Restyler repo, before answering "why is it built this way", or before answering "can I change X" for any file under app/lib, app/app/api, or app/components. Enumerates the load-bearing invariants (verbatim text, entry.* names, self-contained HTML, CORS, footer, submitUrl baking, shared Redis/Blob) that MUST hold, the design decisions behind them, and the known-weak points. Not a how-to for making changes (see forms-restyler-change-control) and not the full data-flow reference (see documentation/architecture.md, which stays the doc of record).
---

# Forms AI Restyler — Architecture Contract

This skill is the "what must hold and why" layer. `documentation/architecture.md`
is the doc of record for data flow, file layout, and env vars — read it for the
full picture. This file exists so a change doesn't quietly break an invariant
that isn't obvious from reading one file in isolation.

## When NOT to use this skill

- Making an actual edit / commit / PR / merge / deploy → `forms-restyler-change-control`
  (this skill tells you what not to break; that one tells you the process).
- Full data-flow narrative, env var table, component prop lists →
  `documentation/architecture.md` directly.
- The open question-text-drift problem and its fix plan → `forms-restyler-drift-elimination-campaign`.
- Debugging a live failure → `forms-restyler-debugging-playbook` /
  `forms-restyler-failure-archaeology`.
- Google Forms' internal data format (`FB_PUBLIC_LOAD_DATA_` index map, type
  codes) → `google-forms-internals-reference`.
- Prompt-engineering the system instruction itself → `forms-restyler-si-engineering`.

All facts below verified against the repo at commit range ending `d2cc516`,
branch `si-improvements`, as of 2026-07-19. Line numbers drift; re-verify with
the commands in "Provenance and maintenance" before trusting them blindly.

---

## 1. The system in one page

```
Creator pastes a public Google Form URL
    │
    ▼
POST /api/scrape (app/app/api/scrape/route.ts)
    → app/lib/scraper.ts fetches the form HTML, extracts FB_PUBLIC_LOAD_DATA_
      via a bracket-depth walker, normalises into FormStructure (JSON)
    → original form shown in a plain <iframe src=...> (cross-origin, baseline)
    │
    ▼
Creator types a styling prompt
    │
    ▼
POST /api/generate (app/app/api/generate/route.ts) — SSE stream
    → app/lib/gemini.ts builds a system prompt embedding FormStructure verbatim
      + the canonical Google Forms footer + a submitUrl baked from THIS request's
      origin, starts a Gemini chat, drives function calling
      (announce_plan, optionally generate_image via app/lib/image-gen.ts →
      Vercel Blob), and returns one complete self-contained HTML document
    → step/result/error SSE events stream to ChatPanel.tsx, which renders a
      live TimelineMessage
    → PreviewPane.tsx swaps in the generated HTML via <iframe srcDoc=...>
    │
    ▼
POST /api/publish (app/app/api/publish/route.ts)
    → nanoid(10) id, HTML + formId + imageKeys saved to Upstash Redis
      (app/lib/store.ts), 30-day TTL; optional one-time POST
      /api/forms/{id}/extend bumps to 365 days
    → GET /f/{id} (app/app/f/[id]/route.ts) serves the frozen HTML byte-for-byte
    │
    ▼
Respondent opens /f/{id}, fills the form, submits
    → generated JS does fetch POST to /api/submit/{formId}
    → app/app/api/submit/[formId]/route.ts maps entry.* fields to
      URLSearchParams and POSTs to
      https://docs.google.com/forms/d/e/{formId}/formResponse
    → response lands in the form owner's Google Sheet / Forms responses tab
```

**Where state lives — nowhere else:**

| Store | Holds | Notes |
|---|---|---|
| Upstash Redis | `PublishedForm` records (`app/lib/store.ts`) | keyed by nanoid id; local dev and prod share the SAME instance |
| Vercel Blob | Generated images (permanent public URLs) | swept daily by `app/app/api/cron/sweep-blobs/route.ts`; local dev and prod share the SAME bucket |
| Nothing else | — | no database, no session store, no server-side user accounts. The generated HTML itself is the only "app" the respondent ever loads. |

Corollary (see Discipline rule in `forms-restyler-change-control`): a `save`,
`extendForm`, blob `put`, or the sweeper's delete pass run from a laptop is a
production write. There is no staging Redis/Blob.

---

## 2. Invariants — the contract

Each row: what must hold, why, what breaks if violated, where it's enforced.

| # | Invariant | Why | Breaks if violated | Enforced in |
|---|---|---|---|---|
| a | Every input's `name` attribute is the exact `entry.XXXXXXXXX` string from `FormStructure` | The submit proxy forwards these keys verbatim to Google's `formResponse` endpoint; Google routes by entry id to the owner's Sheet columns | Submissions silently vanish or land in the wrong column — the product's entire value proposition (own Sheet keeps working) is broken | SI rule 4 in `app/lib/gemini.ts` ("Every form input must use the exact name attribute provided"); `app/app/api/submit/[formId]/route.ts` just forwards whatever keys it's given, no remapping |
| b | Question text, option labels, title, and description are copied character-for-character from `FormStructure` into the generated HTML | Rubric Dimension 2 (groundedness); a paraphrased question changes what the respondent is agreeing to answer | Drift between what the form owner authored and what respondents see; currently the OPEN, unresolved failure mode of this system | SI "CRITICAL — PRESERVE FORM CONTENT EXACTLY" block + rule 1/7 in `app/lib/gemini.ts` (prompt-only enforcement — see weak point below; cross-ref `forms-restyler-drift-elimination-campaign`) |
| c | Generated HTML is one fully self-contained document — all CSS in an inline `<style>`, all JS in an inline `<script>`, no external stylesheet/script URLs | It is served frozen from Redis at `GET /f/{id}` with no build step, and previewed pre-publish via `<iframe srcDoc=...>` in `PreviewPane.tsx`; `srcDoc` documents get no separate origin to fetch assets from in the way a normal page would, and the frozen copy must render correctly indefinitely with no server-side templating at serve time | External refs 404 in the srcdoc preview and/or break once Redis has the only copy — there's no rebuild path | SI rules 1–3 in `app/lib/gemini.ts`; `app/app/f/[id]/route.ts` serves `record.html` verbatim as `text/html` |
| d | `/api/submit/[formId]` keeps CORS fully open (`Access-Control-Allow-Origin: *`, explicit `OPTIONS` handler) and treats Google's `200`, `302`, and `0` (opaque redirect) responses as success | Generated forms run in `srcDoc` iframes, which have a `null` origin — browsers send a CORS preflight even to same-host/localhost destinations; Google Forms' real `formResponse` endpoint answers with a redirect that manual-redirect fetch reports as `0` | Every submission from a published form fails at the network layer, or successful submissions are reported to the respondent as errors | `app/app/api/submit/[formId]/route.ts` lines ~3-12 (CORS_HEADERS + OPTIONS) and line ~46 (status check) |
| e | `buildGoogleFormsFooter(formId)` output is interpolated into the SI verbatim and the model is told to copy it exactly, never paraphrase | Mirrors the real Google Forms responder footer (legal notices, Contact/Terms/Privacy/Report links, the grey text wordmark) — this is rubric-graded and is part of what makes the output pass as a legitimate Google Form surface | Missing/altered legal notices, broken abuse-report or contact links, or a fake logo image where the wordmark must be plain grey text | `app/lib/gemini.ts` `buildGoogleFormsFooter()` (~line 109) + SI rule 18; `data-gforms-footer` marker exists specifically so a future validator (QI-4) can assert on it |
| f | `submitUrl` is baked into the generated HTML from the ORIGIN of the `/api/generate` request that produced it (`${req.nextUrl.origin}/api/submit/{formId}`) | The generated JS hardcodes an absolute URL at generation time — there is no runtime config to redirect it later | HTML generated on `localhost:3000` submits to `localhost:3000` forever, even after being published to prod; any workflow that generates on one host and serves on another (e.g. the eval pipeline) must rewrite this string before publishing, or submissions 404 | `app/app/api/generate/route.ts` line ~61: `const submitUrl = \`${req.nextUrl.origin}/api/submit/${structure.formId}\`;` |
| g | Local dev and prod share the same Upstash Redis instance and the same Vercel Blob bucket | `app/.env.local` is pulled straight from Vercel's env — there is no separate local/staging store | Any local `save`/`extendForm`/blob `put`/sweeper run is a live production mutation; deleting a Redis key or blob locally deletes it for real respondents | `app/lib/store.ts` reads `publish_KV_REST_API_URL`/`KV_REST_API_URL` — same var names used by both environments; no environment branch in the code |
| h | `store.get()` derives `expiresAt` (from `createdAt + 7 days`) and defaults `extended`/`imageKeys` for records that predate those fields, rather than erroring | Redis records from before a schema-adding feature shipped must keep working without a migration script | Old published forms 500 or throw on read instead of degrading gracefully | `app/lib/store.ts` `get()` (~lines 80-102): `raw.expiresAt ?? new Date(...LEGACY_TTL_SECONDS...)`, `raw.extended ?? false`, `raw.imageKeys ?? []` |
| i | The SSE contract from `/api/generate` is exactly three event shapes — `step` (`step`, `status: started\|completed\|failed`, optional `detail`/`imageType`/`imageIndex`/`imageCount`), `result` (`html`, `generatedImages`, optional `imageErrors`), `error` (`message`) — and steps fire in order `analyze → plan → image_gen* → color_match* → html_gen` | `ChatPanel.tsx` parses `data: {json}\n\n` lines and switches on `event.type` to drive the live `TimelineMessage`; it has no schema-negotiation, just literal string checks | Adding/renaming a step or event type without updating the frontend switch (`ChatPanel.tsx` ~lines 341-389) silently stops rendering that step, or throws on unknown shape | `app/app/api/generate/route.ts` (emits), `app/lib/gemini.ts` (`onProgress` callback calls), `app/components/ChatPanel.tsx` (consumes) |

---

## 3. Load-bearing decisions (with rationale, verified in code/docs)

| Decision | Why chosen | Verify |
|---|---|---|
| Bracket-depth walker to extract `FB_PUBLIC_LOAD_DATA_`, not regex | A non-greedy regex (`\[[\s\S]*?\]`) stops at the FIRST closing bracket, which is wrong for nested arrays — Google's structure is deeply nested | `app/lib/scraper.ts` `scrapeForm()` (~lines 61-76); comment explicitly states the regex bug it avoids |
| Image generation lives in a shared lib (`app/lib/image-gen.ts`) called directly by `/api/generate`'s function-calling loop, NOT via internal HTTP self-fetch to `/api/generate-image` | Vercel preview deployments enforce deployment protection that 401s unauthenticated requests, including a server calling its own sibling route over HTTP | `app/lib/image-gen.ts` (exports `generateImage`); `app/app/api/generate/route.ts` imports it directly (`import { generateImage } from "@/lib/image-gen"`) rather than fetching; documented as INC-13 in the incident log and in `documentation/architecture.md` ("Why a shared lib instead of HTTP self-fetch") |
| `functionResponse` parts and vision (`inlineData`) parts are sent to Gemini in two SEPARATE follow-up messages, never mixed in one | Gemini SDK constraint: a message containing a `functionResponse` part cannot also contain other part types | `app/app/api/generate/route.ts` ~lines 489-500: `chat.sendMessage(functionResponses)` then, only if non-empty, a second `chat.sendMessage(visionFollowUp)` |
| Generated images are stored as permanent Vercel Blob URLs (not signed/TTL URLs) with a separate daily sweeper cron, rather than giving each image its own TTL | Published forms can live up to a year (extended TTL); an image TTL shorter than the form's lifetime would 404 images in a still-live form. Reachability is enforced by reference-counting against live Redis records instead | `app/lib/image-gen.ts` `put(filename, buffer, { access: "public" })`; `app/app/api/cron/sweep-blobs/route.ts` + `app/lib/store.ts` `listAllImageKeys()`; cron schedule in `app/vercel.json` (`0 3 * * *`) |
| `extendForm()` is one-time and idempotent — a second call is a no-op that returns the already-extended record rather than re-extending or erroring | Prevents infinite TTL renewal by repeated calls; keeps the extend button in the UI safe to click more than once | `app/lib/store.ts` `extendForm()`: `if (record.extended) return record;` before touching TTL |
| Conversation history capped at the last 10 turns sent to Gemini | Bounds prompt size / cost on long iterative-editing sessions; full history is still tracked client-side, only the API payload is capped | `app/lib/gemini.ts` `generateForm()`: `const recentHistory = history.slice(-10);` |
| `announce_plan` must be called first, before any HTML or `generate_image` call, with an automatic fallback `plan` event if Gemini skips it | Lets the UI show a live plan/timeline entry even when the model doesn't call the function reliably — a soft requirement backed by a hard fallback, not a hard failure | `app/lib/gemini.ts`: SI text "You MUST call this function first…"; route code sorts `announce_plan` before other calls, and after the loop: `if (!announcePlanCalled) onProgress?.({ type: "step", step: "plan", ... })` |

---

## 4. Known-weak points (state plainly, don't oversell fixes)

| Weak point | Status as of 2026-07-19 | Detail |
|---|---|---|
| Question-text / option-label drift | OPEN | Gemini occasionally paraphrases text despite verbatim rules in the SI (e.g. "Rate your current baking/decorating experience." → "Rate your current experience"). Non-deterministic, infrequent, prompt-strengthening (commit `f5599da`) reduced but did not eliminate it. No structural (parse-and-diff) validator exists yet. See `documentation/architecture.md` "Known limitation" and `forms-restyler-drift-elimination-campaign` for the fix plan (QI-4/QI-6 in `requirements/quality_improvements.md`, status "Not started" as of this writing). |
| No automated tests, no CI | Confirmed | `app/package.json` scripts are `dev`, `build`, `start`, `lint` only — no `test` script. No `.github/workflows` directory in the repo. `app/test_redis.mjs` and `app/test_persistence.mjs` are ad-hoc manual scripts, not a suite. Validation is `npx tsc --noEmit` + `npm run lint` + live generation + the eval set/rubric (`evals/`). |
| Screenshot route degraded on Vercel's serverless environment | Confirmed by code, not independently load-tested here | `app/app/api/screenshot/route.ts` tries `@sparticuz/chromium` + `puppeteer-core` (serverless Chromium) and falls back to a `501` with message "Website screenshot is not available in this environment. Use image upload instead." if the chromium import throws. This is a real, code-visible fallback path — treat "degraded on the free tier" as plausible operational context (per session records; see also `documentation/screenshot-production.md`) but verify current Vercel plan/behavior before asserting it fails outright. |
| Extend endpoint has no authorization beyond knowing the form id | Confirmed | `POST /api/forms/{id}/extend` (`app/app/api/forms/[id]/extend/route.ts`) takes no auth token, no owner check — anyone who knows or guesses a published form's nanoid id can extend its TTL to 1 year. Low severity (extending isn't destructive) but worth knowing before building anything auth-adjacent on top of it. |
| Scraper silently skips unsupported question types | Confirmed | `app/lib/scraper.ts` `normalise()`: `if (type === "unknown") continue;` — grids and file-upload questions (any type code not in `TYPE_MAP`) are dropped with no warning surfaced to the creator. A form with a file-upload question will be restyled missing that question entirely. |
| `FB_PUBLIC_LOAD_DATA_` is an undocumented Google internal structure | Confirmed as a structural risk, not a current bug | The entire scrape step depends on a specific nested-array shape (`raw[1][0]`, `raw[1][1]`, `raw[1][8]`, per-question `q[0]`/`q[1]`/`q[3]`/`q[4][0]`) that Google has never published as a stable API and can change without notice. See `google-forms-internals-reference` for the full index map and how to re-verify it against a live form if scraping starts failing. |

---

## 5. Before you change X, check Y

| If you're about to touch... | Check these invariants/decisions first |
|---|---|
| `app/lib/gemini.ts` (`buildSystemPrompt`, rules 1-18) | (a), (b), (e), (i) — any rule wording change risks entry-name fidelity, verbatim text, or the footer contract. Cross-ref `forms-restyler-si-engineering` and `forms-restyler-change-control` before editing; this is prompt-as-code. |
| `app/lib/gemini.ts` (`buildGoogleFormsFooter`) | (e) — footer HTML must stay legally/visually accurate to real Google Forms; changing it changes what every generated form claims about itself. |
| `app/app/api/generate/route.ts` (submitUrl construction) | (f) — any generation pipeline that runs off-origin (evals, staging) must rewrite the baked URL before publishing, or submissions silently 404. |
| `app/app/api/submit/[formId]/route.ts` | (a), (d) — do not narrow CORS or add auth here without accounting for `srcDoc`'s null origin; do not change the 200/302/0 success check without confirming against a live Google Forms response. |
| `app/lib/store.ts` | (g), (h) — any schema change to `PublishedForm` needs a legacy-record fallback like the existing `expiresAt`/`extended`/`imageKeys` defaults; remember writes are always against the shared prod store. |
| `app/lib/scraper.ts` (`TYPE_MAP`, `normalise`) | Known-weak "silently skips unsupported types" — adding a new Google question type means updating `TYPE_MAP` AND deciding what SI rule renders it; also re-verify the `FB_PUBLIC_LOAD_DATA_` index map hasn't shifted (`google-forms-internals-reference`). |
| `app/lib/image-gen.ts` | Load-bearing decision "shared lib not self-fetch" — do not reintroduce an internal `fetch("/api/generate-image")` call from `/api/generate`; it will 401 on Vercel preview deployments. |
| `app/app/api/cron/sweep-blobs/route.ts`, `app/vercel.json` cron entry | (g), decision "permanent Blob + sweeper not TTL" — changing image storage to a TTL model breaks the 1-year-extended-form guarantee unless the TTL is re-derived from `extendForm` state. |
| `app/components/ChatPanel.tsx` (SSE parsing switch) | (i) — must stay in lockstep with the event shapes emitted by `app/app/api/generate/route.ts` / `app/lib/gemini.ts`'s `onProgress` calls. |
| Anything under `app/app/api/forms/[id]/extend/` | Known-weak "no authorization beyond form id" — don't assume this endpoint is access-controlled if building features on top of it. |

---

## Provenance and maintenance

- Written: 2026-07-19, against branch `si-improvements` (6 commits ahead of
  `main`; HEAD at time of writing includes commit `d2cc516` on `main`'s
  history plus unmerged work; re-check with `git log --oneline main..si-improvements`).
- Sources read directly for this skill: `app/lib/gemini.ts`,
  `app/app/api/generate/route.ts`, `app/app/api/submit/[formId]/route.ts`,
  `app/app/api/forms/[id]/extend/route.ts`, `app/app/api/publish/route.ts`,
  `app/app/f/[id]/route.ts`, `app/app/api/screenshot/route.ts`,
  `app/app/api/cron/sweep-blobs/route.ts` (referenced via `app/vercel.json`),
  `app/lib/store.ts`, `app/lib/scraper.ts`, `app/lib/image-gen.ts`,
  `app/components/ChatPanel.tsx`, `app/components/PreviewPane.tsx`,
  `app/vercel.json`, `app/package.json`, `documentation/architecture.md`,
  `requirements/quality_improvements.md`.
- Re-verify quickly with:
  - `grep -n "submitUrl =" app/app/api/generate/route.ts`
  - `grep -n "buildGoogleFormsFooter\|data-gforms-footer" app/lib/gemini.ts`
  - `grep -n "Access-Control-Allow-Origin\|status === 200" app/app/api/submit/[formId]/route.ts`
  - `grep -n "expiresAt ??\|extended ??\|imageKeys ??" app/lib/store.ts`
  - `grep -n '"scripts"' -A5 app/package.json && ls .github/workflows 2>/dev/null || echo "no CI"`
  - `grep -n "QI-4\|QI-6" requirements/quality_improvements.md`
- If any of the above greps return nothing or something structurally
  different, the corresponding table row above is stale — fix the row, not
  just this note.
