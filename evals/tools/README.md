# Eval Set Tools

Pipeline that builds the eval set from competitor forms (see
`requirements/eval_set_creation.md`). Per source: renders the page, captures a
hero screenshot (`evals/style-guides/`), recreates the form via Gemini + the
Google Forms API in your Google account, publishes it, and verifies the app's
scraper can read it.

## Files

| File | Purpose |
|---|---|
| `run.mjs` | Pipeline orchestrator (extract → recreate → create+publish → verify) |
| `aggregate.mjs` | Rebuilds `evals/manifest.json` from per-item shards, prints failures/thin flags |
| `upload-style-guides.mjs` | Uploads screenshots to Vercel Blob (linkable URLs for the doc) |
| `generate-doc.mjs` | Builds `evals/eval-set-doc.html` — the table uploaded to Drive as a Google Doc |
| `auth.mjs` | One-time OAuth loopback flow for the Forms API |
| `generate-restyled.mjs` | Generates restyled forms per item (2 image-model configs) by driving the app: local `/api/generate` (working-tree SI) → submit-URL rewrite → prod `/api/publish` + 1-year extend |
| `lib/` | extract / recreate / gforms / verify / manifest / env modules |

## State model

- `evals/manifest-items/<id>.json` — per-item shard, written after every stage.
  Shards make **parallel runs safe** as long as no two runs process the same id
  (this is how subagent batches are parallelised).
- `evals/manifest.json` — generated aggregate; never edit by hand, rebuild with
  `node aggregate.mjs`.
- `evals/sources.json` — the source list distilled from the competitor-forms doc
  (2 dead Paperform links carry `skip: true`).

## One-time setup

1. `npm install` (in this directory)
2. Google Cloud: create a project → enable **Google Forms API** → OAuth consent
   screen (External; either add yourself as test user, or publish the app to
   production and click through the "unverified app" warning) → create
   **Desktop app** OAuth client → download JSON to `credentials/client_secret.json`.
   ⚠️ The downloaded JSON must belong to the SAME project as the consent screen —
   a mismatched client produces `403: access_denied` that no consent-screen
   change will fix.
3. `npm run auth` — approve in the browser (token cached to `credentials/token.json`;
   Testing-mode tokens expire after ~7 days, production-mode tokens don't)
4. `GEMINI_API_KEY` and `BLOB_READ_WRITE_TOKEN` are read from `../../app/.env.local`

## Running

```
node run.mjs                 # everything (resumes; already-done stages skipped)
node run.mjs --only=<id>     # one source (ids in ../sources.json)
node run.mjs --retry-failed  # only items with a failed stage
node run.mjs --force         # redo stages even if done — WARNING: recreates the
                             # Google Form, orphaning the previous one in Drive
```

Unknown flags abort the run (they used to silently mean "run everything").

After a full run: `node aggregate.mjs && node upload-style-guides.mjs && node generate-doc.mjs`,
then upload `evals/eval-set-doc.html` to Drive as a Google Doc (HTML converts to
a native table).

## Generating restyled forms (the eval subjects)

```
node generate-restyled.mjs --only=<id>[,<id>...]   # specific items
node generate-restyled.mjs --all                   # every ready item
node generate-restyled.mjs --retry-failed          # failed configs only
```

Requirements & behaviour:
- The LOCAL dev server must be running (`npm run dev` in `app/`) — generation
  intentionally targets localhost so the **working-tree system instructions**
  are what gets evaluated. Never point generation at prod: prod may run an
  older SI, silently invalidating the eval.
- Publish + 1-year extend go to the prod deployment (`EVAL_PROD_BASE`, default
  `https://app-red-phi-88.vercel.app`) so links are public. This works because
  local and prod share the same Upstash Redis and Vercel Blob.
- The generated HTML bakes the submit proxy URL from the generating origin;
  the script rewrites `localhost:3000/api/submit/...` → prod before publishing
  and refuses to publish if the rewrite finds nothing.
- Results are stored per item under `generated[<image-model-id>]` in the shard
  (URL, publish id, expiry, image count, duration). Resumable per config;
  parallel-safe across DIFFERENT ids (subagent batches).
- Transient Gemini 503s happen; a single rerun of the same command resumes and
  usually recovers.

## Known behaviours & lessons (July 2026 run)

- **Thin extraction** (`thinExtraction` flag): one-question-at-a-time SPAs
  (Typeform, Fillout, Paperform) often render only their welcome screen text, so
  Gemini infers a plausible question set from the form's metadata instead of the
  real questions. 14/37 items were thin in the initial run — all completed, but
  their content fidelity to the source is lowest; review them first.
- **Verify encoding**: Google embeds `&`, `<`, `>` as `&`-style escapes in
  `FB_PUBLIC_LOAD_DATA_` — verify accepts all encoding variants of a question text.
- **Single-option choice questions**: Gemini emits consent-style items as
  1-option multiple_choice/dropdown; these are coerced to checkboxes (where a
  single option is legal in Google Forms).
- **Orphaned forms**: `--force` reruns and one accidental full-batch run left a
  few duplicate forms in Drive. The manifest's `orphanedForm` field (where
  present) points at superseded variants. Orphans are harmless; delete manually.
- The eval-set Google Doc is generated once from the manifest; the Drive
  connector cannot edit an existing Doc, so regenerating means a new file (manual
  edits to the old doc do not carry over).
