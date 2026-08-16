---
name: forms-restyler-eval-pipeline
description: Load when building or extending the Forms AI Restyler eval set, generating restyled eval forms, fixing eval-pipeline failures, adding a new eval item, re-running/resuming evals/tools/*.mjs, rebuilding evals/manifest.json, uploading style guides to Blob, regenerating the eval Google Doc, or touching evals/sources.json, evals/manifest-items/, or evals/tools/credentials/. Triggers — "run the eval pipeline", "generate restyled eval forms", "node run.mjs", "node generate-restyled.mjs", "aggregate the manifest", "add an eval item", "eval OAuth / forms.body / auth.mjs", "--force on an eval item", "eval doc v3", "thinExtraction", "orphaned form".
---

# Forms AI Restyler — Eval Pipeline Operations

Operating manual for `evals/tools/` — the machinery that builds and extends the
eval set. `evals/tools/README.md` is the doc of record; this skill adds the
operational depth (why the guards exist, what the shard fields mean, how to
run things safely). Cross-reference the README, do not contradict it.

## When NOT to use this skill

- Deciding what counts as evidence, how to rate a generated form, or running
  the rubric → `forms-restyler-validation-and-qa`.
- Editing the system instruction itself → `forms-restyler-si-engineering`.
- Merge/deploy/branch discipline, or "is this safe to run?" →
  `forms-restyler-change-control` (load that FIRST if you're about to mutate
  anything — Redis, Blob, Drive, or `--force`).
- Debugging a broken generation/submit/publish flow in the app itself (not the
  eval tooling) → `forms-restyler-debugging-playbook`.
- Understanding app architecture (routes, SI, image flow) →
  `forms-restyler-architecture-contract`.

## 1. What the eval set IS

37 eval items, each a triple: **(recreated Google Form, hero-screenshot style
guide, standard prompt)**, built from 39 competitor-form sources (2 dead
Paperform links skipped via `skip: true` in `evals/sources.json`). Standard
prompt (all items, v1): `"Redesign this form to match the attached style
guide."` (`evals/sources.json` → `standardPrompt`).

State as of 2026-07-19 (verify before trusting — see §9):
- 37/37 items extract→recreate→create→verify complete (`evals/manifest.json`,
  `generatedAt: 2026-07-18T18:20:32Z`).
- 68/68 restyled generations done (34 items × 2 image configs). 3
  `paperform-*` items have no generations yet — pending user-supplied
  corrected style-guide PNGs (see `requirements/eval_set_creation.md`
  "Remaining").
- Human rating pass **not yet run** (`evals/rater_instructions.md` exists;
  nobody has executed it).
- 14/37 items flagged `thinExtraction: true` — lowest source fidelity, review
  first when auditing.

## 2. State model

| File | Role |
|---|---|
| `evals/sources.json` | Hand-maintained source list (`{ standardPrompt, sources: [...] }`). `skip: true` marks dead links. |
| `evals/manifest-items/<id>.json` | **Source of truth.** One shard per item, written after every stage. Parallel-safe as long as no two runs touch the same id. |
| `evals/manifest.json` | Generated aggregate (`{ generatedAt, items: {...} }`). Rebuild with `node aggregate.mjs`. **Never hand-edit** — it's overwritten wholesale on every run. |

### Shard field walkthrough (real example: `evals/manifest-items/crossfit-virtuosity-feedback.json`)

| Field | Meaning |
|---|---|
| `stages` | `{ extract, recreate, create, verify }`, each `"done"` / `"failed"` / absent. Drives resumability — `run.mjs` skips any stage already `"done"` unless `--force`. |
| `errors[]` | Append-only log of every failure ever recorded for this item, `{ stage, message, at }` — old errors are kept even after the stage later succeeds, so a shard with `stages.create: "done"` can still show a prior `create` failure (e.g. the `setPublishSettings is not a function` googleapis-version bug, now fixed). |
| `resolvedFormUrl` | Source URL after template-landing-page resolution (extract stage). |
| `screenshot` | Relative path under `evals/style-guides/`. |
| `thinExtraction` | `true` if rendered text was under 200 chars (SPA showed only its welcome screen) — Gemini inferred the question set instead of reading it. |
| `extraction` | Persisted `{ text, jsonState, thinExtraction }` so `recreate` can rerun without re-rendering the page. |
| `structure` | The `FormStructure`-shaped JSON Gemini produced (`title`, `description`, `questions[]`) — this is what gets sent to the Forms API AND later reused as the scrape target for `generate-restyled.mjs`. |
| `form` | `{ formId, editUrl, responderUrl, questionCount }` of the CURRENT (non-orphaned) Google Form. |
| `orphanedForm` | Present only if a previous form for this item was superseded (see INC-4 in §4). Same shape as `form`. Orphans are harmless clutter in Drive, not bugs — never auto-delete them. |
| `styleGuideUrl` | Public Vercel Blob URL for the screenshot, set by `upload-style-guides.mjs`. |
| `generated["<config-key>"]` | Per-config restyle result: `{ status, url, publishId, expiresAt, imageCount, imageErrors?, htmlLength, durationMs, at }` on success, `{ status: "failed", error, at }` on failure. TWO key schemes coexist: bare image-model ids (`gemini-2.5-flash-image`, `gemini-3.1-flash-image-preview`) for runs without `--text-models`, and `"<textModel>\|<imageModel>"` composites for runs with it. They never collide; the 68 original records keep the bare-id form. Newer records also carry explicit `textModel`/`imageModel` fields. |

## 3. Pipeline stages (`node run.mjs`, orchestrated in `evals/tools/run.mjs`)

| # | Stage | Lib file | What it does | Guards |
|---|---|---|---|---|
| 1 | extract | `lib/extract.mjs` | Puppeteer renders `source.url` (1440×900), resolves template landing pages to an embedded live form (`LIVE_FORM_PATTERNS`), screenshots the hero screen to `evals/style-guides/<id>.png`, collects `innerText` + embedded JSON blobs. | 45s page-load timeout, 3.5s post-networkidle settle, text capped at 30k chars / JSON at 60k chars, `thinExtraction` flag when text < 200 chars. |
| 2 | recreate | `lib/recreate.mjs` | `gemini-3-flash-preview` turns extracted text + metadata into a `FormStructure` JSON constrained to 8 question types. | Single-option `multiple_choice`/`dropdown` auto-coerced to `checkboxes` (Google Forms requires ≥2 options for choice/dropdown but allows 1 for checkboxes — INC-12); `validateStructure()` throws on missing title/questions, unsupported type, too-few options, or malformed `linear_scale` bounds. |
| 3 | create | `lib/gforms.mjs` | `forms.forms.create` + `batchUpdate` (builds items via `toCreateItemRequest`) + `setPublishSettings` (publish so anyone with the link can respond — required for the app's scraper). | Requires `googleapis@^173` (`setPublishSettings` doesn't exist on `@144` — INC-2). Requires a valid OAuth token (§8). |
| 4 | verify | `lib/verify.mjs` | Unauthenticated fetch of `responderUrl`, confirms `FB_PUBLIC_LOAD_DATA_` is present (not a login redirect) and every question's text appears in the payload. | Checks 4 encoding variants of each question text (`candidates()`) — Google escapes `&`/`<`/`>` differently across the JSON blob vs. HTML-escaped contexts (INC-11). |

Each stage's try/catch records failure to the shard and moves to the next
item — one bad source never blocks the run. `aggregate.mjs` counts a shard
"complete" only when all four stages read `"done"`.

## 4. Command anatomy

### `run.mjs` (extraction/creation pipeline)

```bash
cd evals/tools
node run.mjs                 # everything (resumes; already-done stages skipped)
node run.mjs --only=<id>     # one source (ids from evals/sources.json)
node run.mjs --retry-failed  # only items with a failed stage
node run.mjs --force         # redo stages even if done
```

- **Unknown flags abort the run** (`process.exit(1)` with a usage message) —
  this is a deliberate fix for INC-3: a subagent once ran `node run.mjs
  --help`, the unrecognized flag was silently ignored by the old code, and the
  orchestrator processed the FULL batch, creating duplicate Google Forms in
  the user's Drive. Do not "helpfully" relax this check.
- **`--force` danger (INC-4):** it recreates the Google Form for the target
  item(s), orphaning whatever form existed before — including a form the user
  has already approved and started using. `crossfit-virtuosity-feedback`'s
  `orphanedForm` field (§2) is the scar from exactly this. **Before running
  `--force` on any id, open its shard and confirm the current `form` is not
  one the user has approved/is using.** See DR-8 in
  `forms-restyler-change-control`.

### Post-pipeline sequence

```bash
cd evals/tools
node aggregate.mjs             # rebuilds evals/manifest.json, prints failures + thin flags
node upload-style-guides.mjs   # uploads evals/style-guides/*.png to Vercel Blob, sets shard.styleGuideUrl
node generate-doc.mjs          # writes evals/eval-set-doc.html from the manifest
```

Then upload `evals/eval-set-doc.html` to Google Drive as a Google Doc
(HTML → native Doc/table conversion happens on upload). `upload-style-guides.mjs`
skips items that already have `styleGuideUrl` set and skips items with no
screenshot file — safe to rerun.

**Drive connector limits (INC-19):** the Drive connector can CREATE a doc from
HTML but cannot EDIT an existing one, and cannot pull user-pasted images back
out of a doc. Consequences:
- Regenerating the eval doc always mints a NEW file — version it by suffix
  (v1, v2, v3...) and leave the old one intact (DR-12); manual edits made
  directly in an old doc (e.g. hand-fixed Paperform images) do not carry
  forward.
- The 3 pending Paperform style guides cannot be extracted from the doc
  programmatically — the user must drop corrected PNGs directly into
  `evals/style-guides/`.

## 5. `generate-restyled.mjs` — the critical stage

This is the stage that actually produces the eval subjects (restyled forms),
and it is the one most likely to be run against the wrong code by mistake.

```bash
cd evals/tools
node generate-restyled.mjs --only=<id>[,<id>...]   # specific items
node generate-restyled.mjs --all                   # every item with verify done + a style-guide file
node generate-restyled.mjs --retry-failed          # only configs previously marked failed

# Optional model selection, combinable with any of the above:
--image-models=<id>[,<id>]   # restrict image configs (default: both)
--text-models=<id>[,<id>]    # also vary the text model (default: the app's own default)
```

Unknown model ids abort rather than falling back — `/api/generate` silently
substitutes its default for an unrecognised `textModel`, so a typo would
otherwise yield eval data labelled with a model that did not generate it.

Same unknown-flag abort as `run.mjs`; also aborts if none of
`--only`/`--all`/`--retry-failed` is given.

Per item, per config (without `--text-models`: `gemini-2.5-flash-image` = "A",
`gemini-3.1-flash-image-preview` = "B"; with it, the text × image cross product):
1. Scrape the recreated Google Form via **`EVAL_LOCAL_BASE`** (default
   `http://localhost:3000`) `/api/scrape`.
2. Generate via **local** `/api/generate` (SSE), reading `evt.type ===
   "result"` off the stream (300s timeout).
3. Rewrite the baked submit URL `${LOCAL_BASE}/api/submit/` →
   `${PROD_BASE}/api/submit/` in the returned HTML.
4. Publish via **`EVAL_PROD_BASE`** (default `https://app-red-phi-88.vercel.app`)
   `/api/publish`, then `/api/forms/{id}/extend` for 1-year persistence.

**Why local-then-prod, not all-prod (INC-5 / DR-1):** generation MUST run
against localhost so the working-tree system instruction is what's being
evaluated. Prod builds from `main`; if `main` doesn't yet contain your SI
changes, generating against prod would silently evaluate the OLD prompt — a
near-miss caught by the user, not by tooling, during the original run. Publish
+ extend still target prod so the resulting links are durable and public —
this works only because local dev and prod share the same Upstash Redis and
Vercel Blob store (`app/.env.local` is pulled from Vercel; see
`forms-restyler-change-control` DR-2 for why that makes local runs
production-mutating). **Before any eval generation run, confirm the local dev
server is actually running your intended working tree** — check
`npm run dev` is live in `app/` and that you're on the branch/commit you mean
to evaluate.

**Fail-closed rewrite guard (INC-6):** `app/app/api/generate/route.ts` bakes
`submitUrl = ${req.nextUrl.origin}/api/submit/${formId}` into the generated
HTML at generation time — so anything generated on localhost submits to
localhost until rewritten. `publishAndExtend()` throws `"submit URL not found
in generated HTML — rewrite would leave submissions broken"` if the
`localhost:3000/api/submit/` string isn't present AND the prod string isn't
already there. This is intentional: silently publishing a form whose submit
endpoint is unreachable would be worse than aborting.

**Resumability & failure handling:**
- Results land in `item.generated[<config-key>]`; a config already `status:
  "done"` is skipped on rerun (or, under `--retry-failed`, only `status:
  "failed"` configs are retried).
- Transient Gemini 503s occur (2 of the original 68 generations hit this);
  rerunning the identical command resumes from the shard and typically
  succeeds — not a code bug, just retry it (INC-17).
- An item is skipped entirely (not counted as failed) if `stages.verify !==
  "done"`, `form.responderUrl` is missing, or its style-guide PNG file is
  absent — this is how the 3 pending Paperform items are silently excluded
  from `--all` today.

**Pilot-first discipline (DR-7):** before a wide `--all` or multi-id run,
generate 1 item first, open its two links, and eyeball both configs. This
tooling costs real Gemini quota and creates real public URLs — don't find out
about a systemic problem 68 generations in.

## 6. Parallelising with subagent batches

Safe **only** across DIFFERENT item ids (DR-9) — shards are per-id files, so
two runs touching the same id race and corrupt each other's writes. When
dispatching subagent batches:
- Partition the target id list up front; give each batch an explicit
  `--only=id1,id2,id3` (never `--all` in a subagent — it can't be scoped after
  the fact and violates DR-7 pilot-first anyway).
- Never let two batches share an id, including via `--retry-failed` (a failed
  id could be picked up by more than one batch simultaneously).
- `aggregate.mjs`, `upload-style-guides.mjs`, and `generate-doc.mjs` are NOT
  safe to run concurrently with pipeline batches still in flight (they read
  all shards; `upload-style-guides.mjs` also writes shards) — run them only
  after every batch has finished.

## 7. Adding a new eval item

1. Add an entry to `evals/sources.json` → `sources[]` with the same fields as
   existing entries: `id` (kebab-case, unique), `business`, `industry`,
   `formType`, `product`, `url`, and optionally `isTemplatePage: true` (for
   template landing pages `extract.mjs` should resolve to an embedded live
   form) or `notes`.
2. Run the pipeline scoped to just that id:
   ```bash
   cd evals/tools
   node run.mjs --only=<new-id>
   ```
3. Spot-check the created form — open `item.form.editUrl` from
   `evals/manifest-items/<new-id>.json` (or `responderUrl` for the public
   view) and confirm questions/options look right, especially if
   `thinExtraction` came back `true`.
4. Re-aggregate and re-upload:
   ```bash
   node aggregate.mjs
   node upload-style-guides.mjs
   ```
5. If you want it in the restyled-generation set too:
   ```bash
   node generate-restyled.mjs --only=<new-id>
   ```
   (requires the local dev server running — see §5).
6. Regenerate the doc and upload it as a **new version** (Drive can't edit the
   existing one — INC-19/DR-12):
   ```bash
   node generate-doc.mjs
   ```

## 8. OAuth setup summary

`evals/tools/auth.mjs` runs a one-time loopback OAuth flow for the Forms API
(`https://www.googleapis.com/auth/forms.body` scope only, port `53682`,
redirect `http://127.0.0.1:53682/oauth2callback`).

1. In Google Cloud Console: create/select a project → enable **Google Forms
   API** → configure the OAuth consent screen (External; add yourself as a
   test user, or publish to production) → create an OAuth client of type
   **Desktop app** → download its JSON to
   `evals/tools/credentials/client_secret.json` (gitignored).
2. `npm run auth` (in `evals/tools/`) → opens the consent URL, approve in the
   browser → token cached to `evals/tools/credentials/token.json` (gitignored).
3. `lib/gforms.mjs` reads both files directly; if `token.json` is missing it
   throws `No OAuth token at .../token.json — run "npm run auth" first`.

**Same-project rule (INC-1):** the client JSON downloaded in step 1 must
belong to the SAME GCP project whose consent screen you configured. A
mismatched client produces `Error 403: access_denied` that persists no matter
what you change on the consent screen — the fix is comparing the client id
prefix in the downloaded JSON against the project's Credentials page, not
retrying consent-screen settings. If you hit a 403 that survives adding test
users and publishing the consent screen, check this FIRST.

**Token lifetime:** Testing-mode consent screens issue tokens that expire
after ~7 days — re-run `npm run auth` when `create` stage calls start failing
with auth errors. Production-mode consent screens (published, "unverified
app" warning clicked through) issue tokens that don't expire on that
schedule.

## 9. Re-verification commands

```bash
# Current completion state
cd evals/tools && node aggregate.mjs

# Confirm generation coverage (34 items × 2 configs = 68 expected done)
python3 -c "
import json
d = json.load(open('../manifest.json'))
done = sum(1 for i in d['items'].values() for c in i.get('generated', {}).values() if c.get('status') == 'done')
print(done, 'generations done')
"

# Which items still lack any generation (should be the 3 pending Paperform ids)
python3 -c "
import json
d = json.load(open('../manifest.json'))
print([k for k, i in d['items'].items() if not i.get('generated')])
"
```

---

## Provenance and maintenance

Written 2026-07-19. Verified directly against repo contents on that date:
`evals/tools/README.md`, `run.mjs`, `generate-restyled.mjs`, `aggregate.mjs`,
`upload-style-guides.mjs`, `generate-doc.mjs`, `auth.mjs`, `lib/{env,manifest,
extract,recreate,gforms,verify}.mjs`, `package.json`; `evals/sources.json`;
`evals/manifest.json` (`generatedAt: 2026-07-18T18:20:32Z`, 37/37 complete,
68/68 generated); `evals/manifest-items/crossfit-virtuosity-feedback.json`
(full shard field walkthrough source); `requirements/eval_set_creation.md`.
Incident numbering (INC-*) follows `forms-restyler-failure-archaeology`;
discipline numbering (DR-*) follows `forms-restyler-change-control`.

Re-verify before relying on the "current state" numbers in §1 — they drift
every time the pipeline runs:
```bash
cd evals/tools && node aggregate.mjs   # authoritative completion/failure/thin counts
ls evals/manifest-items/ | wc -l       # item count sanity check
grep -c '"skip": true' evals/sources.json   # dead-link count
```
