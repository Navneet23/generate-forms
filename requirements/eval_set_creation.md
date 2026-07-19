# Eval Set Creation — Requirements

## Status: COMPLETE incl. generation stage (2026-07-18)

All 37 eval items built and verified (2 dead-link sources skipped). Deliverables:
- 37 published Google Forms (user's account), all verified publicly scrapable
- 37 hero screenshots in `evals/style-guides/` + Vercel Blob URLs
- `evals/manifest.json` (+ per-item shards in `evals/manifest-items/`)
- 14 items flagged `thinExtraction` (SPA sources rendered only their first
  screen; questions inferred from form purpose) — spot-checked and accepted
- Run details, fixes, and operational lessons: `evals/tools/README.md`

### Generation stage (restyled forms for rating)

68/68 restyled forms generated via `evals/tools/generate-restyled.mjs`
(34 items × 2 configs; Paperform's 3 items pending corrected style guides):
- **Config A**: `gemini-2.5-flash-image` · **Config B**: `gemini-3.1-flash-image-preview`
- Generation ran against the LOCAL dev server so the working-tree SI (the thing
  under evaluation) is what generated the forms — prod was on an older SI.
  The baked localhost submit URL is rewritten to the prod origin before publish.
- Published + extended to 1-year persistence via the prod deployment
  (`https://app-red-phi-88.vercel.app/f/{id}`); shared Redis/Blob makes this work.
- 9/34 items generated 0 images in both configs (surveys — the SI's intended
  judgment); for those rows A-vs-B measures generation variance, not image models.
- **Google Doc v2** (form + style guide + prompt + both generated links per row):
  https://docs.google.com/document/d/1-4ee_G6DtGyIoqfizjqnqd4-BvyPxFX1UIeXoQ38Msg/edit
  (v1 doc retains the manually-fixed Paperform images; the Drive connector cannot
  edit docs in place, so v2 is a separate file)

### Remaining

- Drop corrected `paperform-*.png` files into `evals/style-guides/`, then:
  `node generate-restyled.mjs --only=paperform-client-onboarding,paperform-restaurant-order,paperform-event-registration`
  and regenerate/publish the doc (v3)
- Rating pass per `evals/rater_instructions.md`

## Goal

Build the evaluation set for rating generated forms against `evals/rater_instructions.md`.
Each eval item is a triple: **(Google Form, prompt, style guide screenshot)**. Source
material: ~39 high-quality competitor forms collated in the "Forms Canvas: canonical SMB
forms" doc — 15 real SMB forms (Typeform/Jotform) and 24 competitor templates (Typeform,
Jotform, Paperform, Tally, Fillout; 2 Paperform links are dead and are skipped).

## Approach

A local pipeline (in `evals/tools/`) that, per source form:

1. **Extract** — render the source URL headlessly (Puppeteer), capture:
   - The **hero/first screen screenshot** (1440×900 viewport) → `evals/style-guides/{id}.png`.
     This becomes the style guide. No multi-screen capture.
   - The **rendered page text** (plus any embedded JSON state blobs, capped) — passed to
     Gemini as text to avoid unnecessary vision calls.
   - Template landing pages (typeform.com/templates, jotform.com/form-templates, etc.)
     are resolved to their embedded live form iframe when present; otherwise the landing
     page itself is used.
2. **Recreate** — Gemini (`gemini-3-flash-preview`) turns extracted text + doc metadata
   (business, industry, form type) into a structured question list constrained to the
   8 supported question types.
   - **Similar, not exact** (product decision): unsupported types are mapped to the
     nearest supported type (rating/NPS → linear_scale; email/phone → short_answer;
     consent → multiple_choice) or skipped (payment, signature, file upload).
   - If extraction yielded mostly noise (SPA rendered only question 1, marketing copy),
     Gemini infers a plausible question set for the form's stated purpose; the item is
     flagged `thinExtraction` in the manifest for human review.
3. **Create** — Google Forms API (`forms.create` + `batchUpdate`) builds the form in the
   user's own Google account (OAuth, `forms.body` scope).
4. **Publish** — `forms.setPublishSettings` publishes the form so anyone with the link
   can respond (required for the app's scraper to read `FB_PUBLIC_LOAD_DATA_`).
5. **Verify** — fetch the responder URL unauthenticated and confirm
   `FB_PUBLIC_LOAD_DATA_` is present and the question count matches what was created.
   This reuses the same precondition the app's scraper needs, so a verified eval form is
   guaranteed loadable by the product.
6. **Manifest** — `evals/manifest.json` is the source of truth: per item, the source URL,
   resolved form URL, screenshot path, created form IDs/URLs, per-stage status,
   timestamps, and errors.

**Standard prompt (v1, all items):**
> "Redesign this form to match the attached style guide."

## Error handling & resumability

- Each stage runs in its own try/catch; a failure records the error in the manifest and
  moves on to the next item — one bad form never blocks the run.
- The manifest is saved after every stage; re-running skips already-completed stages
  (`--force` redoes an item, `--only=<id>` targets one item, `--retry-failed` reruns
  failures only).
- Extraction guards: page-load timeout (45s), text-size cap, `thinExtraction` flag when
  rendered text is too short to trust.
- Creation guards: Forms API errors (quota, invalid item) are recorded per item;
  publish and verify failures leave the form in the manifest with its edit URL so it can
  be fixed manually.

## Auth & credentials

- One-time: user creates a GCP project, enables the Forms API, creates a Desktop OAuth
  client, saves it as `evals/tools/credentials/client_secret.json` (gitignored).
- `node auth.mjs` runs a loopback OAuth flow once and caches the token
  (`credentials/token.json`, gitignored). Consent screen in Testing mode — tokens expire
  after ~7 days; re-run `auth.mjs` if needed.
- `GEMINI_API_KEY` is read from `app/.env.local` (already present for the app).

## Layout / ownership decisions

- Tools live in `evals/tools/` with their own `package.json` (Puppeteer pinned to the
  app's version so the cached Chrome binary is reused; `googleapis`;
  `@google/generative-ai`). The app's dependencies are untouched.
- Eval forms are created in and owned by the user's personal Google account.
- Style-guide screenshots and the manifest are committed; credentials and node_modules
  are not.
- Sub-agents may later parallelise form creation, but the system is built and validated
  on a couple of items first.

## Out of scope (v1)

- Varied/adversarial prompts per item (a later subset will exercise rubric Dimension 3).
- Automated eval runs / LLM-as-judge (see FI-3 in `requirements/future_improvements.md`).
- Pixel-perfect recreation of competitor forms — similarity is the goal.
