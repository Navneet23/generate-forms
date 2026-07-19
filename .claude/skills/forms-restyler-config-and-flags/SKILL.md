---
name: forms-restyler-config-and-flags
description: Load when configuring environments for the Forms AI Restyler repo, hunting an env-var problem (missing key, wrong Redis/Blob store, cron 401), choosing or auditing a Gemini model ID, tuning a TTL/timeout/history-cap constant, or adding a brand-new configuration axis (env var, model choice, CLI flag). Triggers: "what env vars does this need", "which Redis does local use", "CRON_SECRET", "what model does X use", "add a flag to run.mjs", "why did the sweeper 401", "GEMINI_API_KEY not set", "add a config option".
---

# Forms AI Restyler — Configuration & Flags

A catalog of every knob in this repo: app env vars, model IDs, behavioural
constants (TTLs/timeouts/caps), and eval-tooling env vars + CLI flags. Ground
truth is the code cited in each table — re-run the grep in "Provenance" below
before trusting a row that looks stale.

Jargon: **SI** = system instruction built by `buildSystemPrompt()` in
`app/lib/gemini.ts`. **Manifest shard** = `evals/manifest-items/<id>.json`.
See `forms-restyler-change-control` for both, and for the discipline rules
(DR-*) referenced below.

## 1. App environment variables

| Variable | Required? | Consumed where | Prod vs local source | Notes |
|---|---|---|---|---|
| `GEMINI_API_KEY` | Yes | `app/lib/gemini.ts` (`generateForm`, ~line 222); `app/lib/image-gen.ts` (~line 38) | Prod: set in the Vercel project. Local: `app/.env.local` (pulled from the same Vercel project). | Same key powers both text (SI) and image generation calls — one key, two model families. |
| `publish_KV_REST_API_URL` / `publish_KV_REST_API_TOKEN` | Yes (primary) | `app/lib/store.ts` lines 20–21 | Set by the Vercel KV/Upstash integration; present in `app/.env.local` because that file is pulled from the Vercel project, not hand-written. | Checked FIRST via `??` fallback — see next row. |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Fallback | `app/lib/store.ts` lines 20–21 | Legacy naming; used only if the `publish_*` pair is unset. | Both naming pairs are present in `app/.env.local` as of 2026-07-19 (verified by key-name-only grep — see Provenance). `store.ts` line 19 constructs one `Redis` client from whichever pair resolves. |
| `BLOB_READ_WRITE_TOKEN` | Yes | `app/lib/image-gen.ts` (`put()` from `@vercel/blob`); `app/app/api/cron/sweep-blobs/route.ts` (`list`/`del`) | Prod: Vercel Blob store token. Local: `app/.env.local`. | Same store token is used for image upload AND for the sweeper's delete pass. |
| `CRON_SECRET` | Yes (prod only) | `app/app/api/cron/sweep-blobs/route.ts` line 11 — compares `Authorization: Bearer <CRON_SECRET>` | Prod: set in Vercel; Vercel Cron sends the header automatically per `app/vercel.json`. | **Confirmed absent from `app/.env.local` as of 2026-07-19** — local dev cannot authenticate a sweep call unless you export it yourself and match it in the request. This is a real gap if you ever want to dry-run the sweeper locally. |
| `VERCEL` | N/A (platform-set) | `app/lib/gemini.ts` line 14: `IS_LOCAL = !process.env.VERCEL` | Prod: auto-set by the Vercel platform. Local: unset. | Gates debug logging, not a "config" var per se: when unset (local), every generation writes the full SI + response trace to `app/debug.log` (gitignored, but see below — it can appear as an untracked file). |

**How local gets these values:** `app/.env.local` is pulled directly from the
Vercel project (not hand-authored), so **local dev shares the SAME Upstash
Redis and the SAME Vercel Blob store as production** — there is no separate
dev/staging store. Any local `save`/`extendForm`/blob upload/sweep IS a
production write. This is DR-2 (shared-state rule, `forms-restyler-change-control`): never run
destructive experiments (sweeper, bulk deletes) against this store casually,
and never hand-delete Redis keys.

Secrets discipline (DR-11): `app/.env.local` is covered by `app/.gitignore`
(`.env*` and `.env*.local`); `evals/tools/credentials/` is covered by
`evals/tools/.gitignore` (`credentials/`). Neither has ever entered git — keep
it that way. Never print or copy actual secret values; the allowed pattern to
audit which keys exist without leaking values is:

```
grep -o '^[A-Za-z_]*=' app/.env.local
```

## 2. Model IDs

| Model | Role | Defined at | User-selectable? | Notes |
|---|---|---|---|---|
| `gemini-3-flash-preview` | Text/HTML generation (the SI, function-calling loop) | `MODEL_ID` const, `app/lib/gemini.ts` line 12 | No — hardcoded | One text model for all form generation; drives `announce_plan` and conditionally `generate_image`. |
| `gemini-2.5-flash-image` | Image generation — **UI default** | `ImageModelId` union, `app/lib/image-gen.ts` line 6; default state `app/app/page.tsx` line 27 (`useState(..., "gemini-2.5-flash-image")`) | Yes — dropdown | Eval "Config A". |
| `gemini-3.1-flash-image-preview` | Image generation — alternative | Same union, `app/lib/image-gen.ts` line 6 | Yes — dropdown | Eval "Config B". |
| `"none"` | No image generation | Checked in `app/app/api/generate/route.ts` line 62: `includeImages = imageModel != null && imageModel !== "none"` | Yes — dropdown option "No images" | Not merely an instruction: when `includeImages` is false, `app/lib/gemini.ts` lines 228–232 never push `generateImageFunctionDecl` into the `tools` array, so Gemini has no `generate_image` function to call — it is structurally unavailable, not just discouraged. |

The selector lives in `app/components/ChatPanel.tsx` lines 630–643 (a
`<select>` with exactly these three `<option>`s). Note the UI **defaults to
images ON** (`gemini-2.5-flash-image`), not `"none"` — a fresh session
generates images unless the creator changes the dropdown.

Model IDs are volatile (this repo has already lived through `gemini-2.5-*` →
`gemini-3.1-*` naming and a text-model bump) — the table above is accurate
**as of 2026-07-19**; re-verify with the grep in Provenance before relying on
it.

## 3. Behavioural constants

| Constant | Value | Location | Purpose |
|---|---|---|---|
| `TTL_SECONDS` | 30 days | `app/lib/store.ts` line 24 | Default expiry set by `save()`. |
| `EXTENDED_TTL_SECONDS` | 365 days | `app/lib/store.ts` line 25 | One-time bump applied by `extendForm()`; `extended` flag prevents a second bump. |
| `LEGACY_TTL_SECONDS` | 7 days | `app/lib/store.ts` line 27 | NOT a live TTL — only used by `get()` to backfill `expiresAt` for pre-feature records that lack the field (`createdAt + 7d`). |
| `SAFETY_WINDOW_MS` | 1 hour | `app/app/api/cron/sweep-blobs/route.ts` line 7 | Sweeper skips any blob uploaded within the last hour, so an in-flight publish (image uploaded, Redis record not yet written) survives a concurrent sweep. |
| cron schedule | `0 3 * * *` (03:00 UTC daily) | `app/vercel.json` line 5 | Triggers `GET /api/cron/sweep-blobs`. |
| conversation history cap | last 10 turns | `app/lib/gemini.ts` line 254: `history.slice(-10)` | Caps what's replayed into the Gemini chat per generation call, regardless of how long the session has run. |
| screenshot capture timeout | 15,000 ms | `app/app/api/screenshot/route.ts` line 83: `page.goto(safeUrl, { waitUntil: "networkidle2", timeout: 15000 })` | Puppeteer timeout for the style-guide "use a website" capture path. |
| form scrape fetch | no explicit timeout | `app/lib/scraper.ts` line 42 | Plain `fetch()` with a custom User-Agent, no `AbortController`/timeout — relies on the runtime's default. Different from the eval tooling's extraction, which does time-box (next row). |
| eval `PAGE_TIMEOUT_MS` | 45,000 ms | `evals/tools/lib/extract.mjs` line 8 | Puppeteer `page.goto` timeout during eval source extraction (competitor form scraping). |
| eval `SETTLE_MS` | 3,500 ms | `evals/tools/lib/extract.mjs` line 9 | Extra wait after `networkidle2` for SPA animation/font settling, applied after every `goto`. |
| eval `GENERATE_TIMEOUT_MS` | 300,000 ms (5 min) | `evals/tools/generate-restyled.mjs` line 24 | `AbortController` wrapping the LOCAL `/api/generate` SSE call during eval generation. |

## 4. Eval-tools configuration

**`evals/tools/lib/env.mjs`** — read in full; it defines only path constants
and one secret-loader, NOT `EVAL_PROD_BASE`/`EVAL_LOCAL_BASE` (those live in
`generate-restyled.mjs` — see below, a discrepancy worth knowing if you go
looking for them here first):

- `TOOLS_DIR`, `EVALS_DIR`, `REPO_ROOT`, `CREDENTIALS_DIR`, `STYLE_GUIDES_DIR`,
  `MANIFEST_PATH`, `SOURCES_PATH` — all derived from `import.meta.url`, not env vars.
- `getGeminiApiKey()` — returns `process.env.GEMINI_API_KEY` if set, else parses
  the `GEMINI_API_KEY=` line directly out of `app/.env.local`. Same key the app
  uses; no separate eval secret.

**`evals/tools/generate-restyled.mjs`** (lines 22–29):

| Constant | Default | Override |
|---|---|---|
| `LOCAL_BASE` | `http://localhost:3000` | `EVAL_LOCAL_BASE` |
| `PROD_BASE` | `https://app-red-phi-88.vercel.app` | `EVAL_PROD_BASE` |

`CONFIGS` array pins the two eval image configs by model-ID key:
`gemini-2.5-flash-image` ("A") and `gemini-3.1-flash-image-preview` ("B") —
must stay in sync with the model IDs table above.

**CLI flags** (both scripts abort on any unrecognized argument — DR-6 /
INC-3, the flag that silently ran a full batch and created a duplicate Google
Form):

| Flag | `run.mjs` | `generate-restyled.mjs` |
|---|---|---|
| `--only=<id>` | Single id, exact match (`source.id !== only` — NOT comma-separated) | Comma-separated list (`.split(",")`) — different parsing from `run.mjs`, don't assume the two accept the same syntax |
| `--all` | N/A (no-arg run already means "all non-skipped, resume") | Required to mean "every completed non-skipped item" — one of `--only`/`--all`/`--retry-failed` is mandatory or the script exits with a usage error |
| `--retry-failed` | Reprocess only items with a failed stage | Reprocess only configs with `status: "failed"` |
| `--force` | Redo stages even if done — **recreates the Google Form** (dangerous, see §5) | Not supported — no `--force` in this script |
| no args | Process all non-skipped sources, resuming | Exits with usage error (one selector flag is required) |

**`evals/tools/credentials/`** (gitignored via `evals/tools/.gitignore` →
`credentials/`):
- `client_secret.json` — OAuth Desktop-app client downloaded from Google Cloud
  Console. **Must belong to the SAME GCP project** as the Forms API consent
  screen being used (INC-1: a client from a different project produces a
  403 `access_denied` that survives every consent-screen fix).
- `token.json` — OAuth token cache, written by `npm run auth` (→ `node auth.mjs`).

## 5. Production vs experimental knobs, and their guards

| Knob | Status | Guard | Why |
|---|---|---|---|
| `GEMINI_API_KEY`, KV/Blob vars, `CRON_SECRET` | Production | Fail hard if missing (`throw new Error("GEMINI_API_KEY is not set")` in both `gemini.ts` and `image-gen.ts`; sweeper returns 401 without `CRON_SECRET` match) | Fail-closed by construction — no silent no-op path. |
| Text model `gemini-3-flash-preview` | Production, hardcoded | None needed — not user-facing | Changing it is an SI/behavioural change; treat as covered by `forms-restyler-change-control`, not this skill. |
| Image model dropdown (`none` / 2.5 / 3.1) | Production, user-facing | `includeImages` gate structurally removes the `generate_image` tool rather than just prompting against it | Belt-and-suspenders: even a jailbroken response can't call a tool that isn't offered. |
| `run.mjs --force` | Experimental / dangerous | **None in code** beyond the unknown-arg guard — `--force` on an already-`done` item silently redoes the `create` stage, which **recreates the Google Form**, orphaning the previous one | INC-4: `--force` on a user-approved item desynced the doc/manifest. DR-8: NEVER `--force` an item whose form the user has approved — check the manifest shard (`evals/manifest-items/<id>.json`) first. This is a discipline rule, not an automated check; treat any `--force` invocation as needing manual sign-off. |
| `generate-restyled.mjs` targeting | Production process, but points at LOCAL by design | Throws (`"submit URL not found in generated HTML"`) if the localhost→prod URL rewrite matches nothing | INC-5/INC-6: generation must run against the LOCAL dev server (working-tree SI) even though publish/extend hit PROD — pointing generation at PROD would silently eval the wrong SI. The throw-if-rewrite-finds-nothing check is DR-6's "fail closed when a safety rewrite finds nothing to do." |
| Sweeper (`/api/cron/sweep-blobs`) | Production, scheduled | `SAFETY_WINDOW_MS` (1h) skip window + `inUse` set from `listAllImageKeys()` | Runs against the SHARED prod store (DR-2) — do not invoke manually outside the cron unless you understand you're mutating production Blob state. |

## 6. Adding a new configuration axis — checklist

1. **Define the default in exactly one place.** A constant near its single
   consumer (like `TTL_SECONDS` in `store.ts`) or one `??` fallback chain (like
   the KV var pair) — never duplicate a default across files.
2. **Consider both env-var namings if it might come from a platform
   integration.** The `publish_KV_REST_API_*` / `KV_REST_API_*` split exists
   because a Vercel integration renamed its vars; a new integrated service may
   do the same. Fallback order matters — document which wins.
3. **Never bake a secret into code or a committed file.** If it's a credential,
   it belongs in `app/.env.local` (app) or `evals/tools/credentials/` (eval
   tooling) — both already gitignored. Don't add a new secret path without
   confirming it's covered by an existing or new `.gitignore` rule.
4. **Add fail-closed validation.** Missing required config should throw/401,
   not silently fall back to a default that masks the misconfiguration (see
   `GEMINI_API_KEY` checks and the sweeper's `CRON_SECRET` comparison as the
   pattern to copy). If the axis is a CLI flag, follow DR-6: unknown arguments
   abort the run, and safety rewrites/checks that find nothing to do should
   throw rather than proceed silently.
5. **Document it in `documentation/architecture.md`'s Environment Variables
   table** (currently ends around line 342) if it's an app env var.
6. **Add a row to this skill's tables** (§1–§4 above) so the next agent finds
   it without re-deriving it from source.
7. **Model IDs specifically:** update the `CONFIGS` array in
   `evals/tools/generate-restyled.mjs` if the axis is an image model, so eval
   configs stay in sync with what the UI offers — a mismatch here means the
   eval is silently measuring a model the UI doesn't expose, or vice versa.

## When NOT to use this skill

- Editing the SI/prompt text itself, or judging whether an SI change is safe
  to merge → `forms-restyler-si-engineering` and `forms-restyler-change-control`.
- Diagnosing a broken flow at runtime (stuck generation, CORS error, wedged
  dev server) → `forms-restyler-debugging-playbook`.
- Understanding request/response data flow between routes/lib files rather
  than their config surface → `forms-restyler-architecture-contract`.
- Day-to-day running of the dev server or eval pipeline commands (as opposed
  to what each flag/env var means) → `forms-restyler-run-and-operate` and
  `forms-restyler-eval-pipeline`.
- Build/deploy mechanics → `forms-restyler-build-and-env`.

## Provenance and maintenance

All facts above were read directly from source on 2026-07-19: `app/lib/store.ts`,
`app/lib/gemini.ts`, `app/lib/image-gen.ts`, `app/lib/scraper.ts`,
`app/app/api/generate/route.ts`, `app/app/api/cron/sweep-blobs/route.ts`,
`app/app/api/screenshot/route.ts`, `app/vercel.json`, `app/app/page.tsx`,
`app/components/ChatPanel.tsx`, `app/.gitignore`, `evals/tools/lib/env.mjs`,
`evals/tools/generate-restyled.mjs`, `evals/tools/run.mjs`,
`evals/tools/lib/extract.mjs`, `evals/tools/.gitignore`,
`evals/tools/package.json`, `evals/tools/README.md`,
`documentation/architecture.md`. Local env-var presence was checked with
`grep -o '^[A-Za-z_]*=' app/.env.local` (key names only, no values printed).

Flags and model IDs drift fastest — re-verify each table with:

```bash
# Env var names actually present locally (no values):
grep -o '^[A-Za-z_]*=' app/.env.local

# Model IDs currently wired in:
grep -rn "gemini-[0-9]" app/lib/gemini.ts app/lib/image-gen.ts app/components/ChatPanel.tsx app/app/page.tsx

# CLI flags currently accepted:
grep -n "args.includes\|startsWith(\"--" evals/tools/run.mjs evals/tools/generate-restyled.mjs

# Behavioural constants:
grep -n "TTL_SECONDS\|SAFETY_WINDOW_MS\|slice(-10)\|PAGE_TIMEOUT_MS\|SETTLE_MS\|GENERATE_TIMEOUT_MS" \
  app/lib/store.ts app/app/api/cron/sweep-blobs/route.ts app/lib/gemini.ts \
  evals/tools/lib/extract.mjs evals/tools/generate-restyled.mjs
```
