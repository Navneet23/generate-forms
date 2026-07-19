---
name: forms-restyler-validation-and-qa
description: Load when deciding whether a change to the Forms AI Restyler repo is validated, designing an eval or A/B comparison, interpreting rubric ratings, auditing the golden eval-set inventory, or asked "is this good enough to merge/claim". Triggers — "is this validated", "run an A/B", "rate these two forms", "what does the rubric say", "groundedness check", "is QI-N proven", "what counts as evidence here", "eval set inventory", "rating pass", "stack-ranked dimensions", "failure mode checklist".
---

# Forms AI Restyler — Validation and QA

This skill defines what counts as evidence in this repo, digests the rating rubric,
inventories the golden eval set, and states the acceptance discipline for any change
that claims to improve generation quality. It does not run tools or merge code — see
"When NOT to use this skill" for the siblings that do.

## 0. What counts as evidence here

There is **no automated test suite and no CI** in this repo (confirmed: `app/package.json`
`scripts` has no `test` entry; no `.github/workflows`). `app/test_redis.mjs` and
`app/test_persistence.mjs` are ad-hoc manual scripts, not a suite. Evidence for any change
is therefore built from four layers, weakest to strongest:

| Layer | What it proves | What it does NOT prove |
|---|---|---|
| `cd app && npx tsc --noEmit` | No type errors | Nothing about generation quality or Gemini's actual output |
| `cd app && npm run lint` | No lint violations | Same as above |
| Live generation on `npm run dev` | The changed code path runs and produces *a* plausible output once | Nothing about the probability distribution — SI failures are non-deterministic, so one good run is necessary but not sufficient |
| Eval set + rubric (this skill) | A measured, comparable quality signal across 37 real items, rated on the same stack-ranked dimensions | Ground truth about real users — the eval set is competitor-form recreations rated by (currently) a single internal rater pass, not production traffic |

A claim like "this SI change makes forms better" is only as strong as the layer behind
it. `tsc`/lint clean + one nice-looking local generation is class (b)-level evidence at
best — it does **not** license a quality claim. Only a rubric-scored A/B on the eval set
does (§4).

## 1. The rubric, digested

Ground truth: `evals/rater_instructions.md`. Read it in full before rating anything —
this section is a working reference, not a replacement. Note its own header: it is
titled "(template)" and contains several bracketed open questions from its authors
(e.g. "[Do we want a minor issues thing…]", aesthetics ranked lowest with an inline
"[I think we want this higher]"). Treat exact wording as slightly unsettled; treat the
**stack ranking and the four dimensions** as settled.

### 1.1 The four dimensions, stack-ranked

| Rank | Dimension | Question it answers |
|---|---|---|
| 1 | **Functionality & stability** | Does the form still work? Navigation and submit have to work. |
| 2 | **Groundedness** | Is the generated form faithful to the original Google Form's content? |
| 3 | **Completeness & instruction following** | Did it do what the prompt (and style guide) asked? |
| 4 | **Visual aesthetics & layout** | Does it look professional, readable, well-designed? |

The rubric states this ranking twice: once as the dimension order, and explicitly again
in the "Final overall comparison" instructions — "Dimension (1) functionality & stability
should be the primary consideration… Dimension (4) of aesthetics should be prioritized
lowest." The rubric's own worked example makes the practical meaning concrete: *"Model A
is much better. Although Model B followed the design instructions well (Dimension 3), it
failed the functionality test (Dimension 1) because the generated form could not be
filled out — it did not have a way to navigate between questions."*

**What this means in practice:** a gorgeous form that cannot be submitted is a WORSE
outcome than a plain, unstyled-looking form a respondent can actually complete. When
judging or reporting an eval result, lead with Dimension 1 and 2 status; a Dimension 4
improvement never offsets a Dimension 1 or 2 regression. If you only have time to
eyeball a handful of generations before a merge, spend it on "does Submit work" and
"is the question text right", not on whether the gradient looks nice.

### 1.2 Per-dimension rating scales

| Dimension | Scale (per-model rating) | Notes |
|---|---|---|
| 1. Functionality & stability | No Issues / Minor Issue(s) / Major Issue(s) / Critical Failure / N/A (no interactive elements) | "Minor" examples: no click feedback, disproportionately small form. "Major": Next button broken, submission broken. "Critical": blank screen, crash/freeze. |
| 2. Groundedness | Not grounded / Reasonably grounded / Completely grounded | 3-point scale, no N/A. "Not grounded" = at least one important piece of information is incorrect or inconsistent — this is a low bar to fail. |
| 3. Completeness & instruction following | No Issues / Minor Issue(s) / Major Issue(s) | No N/A option in the current doc. "Major" example given: prompt asked for question-by-question but got a single-page survey. |
| 4. Visual aesthetics & layout | No Issues / Minor Issue(s) / Major Issue(s) / N/A (cannot assess) | "Major" examples: overlapping text, clashing colors. |

Each dimension also has an **A-vs-B comparison** on a 7-point scale ("Model A is Much
Better" … "Model B is Much Better"), plus one **final overall comparison** on the same
7-point scale that is supposed to weigh the four dimensions per the stack rank above, with
a required written explanation naming the deciding dimension.

### 1.3 Named failure-mode checklist

Raters check all that apply, independent of the scalar ratings above. Grouped by
dimension (abbreviated from `evals/rater_instructions.md` — read the source for exact
wording):

- **General:** Model Punt (form isn't visible/renderable at all).
- **Dimension 1 (Functionality):** submission doesn't work; navigation between questions
  doesn't work; no visual feedback on selecting an option.
- **Dimension 2 (Groundedness):** blank/error screen; stuck loading; placeholder changed
  or mismatched; question text doesn't match original; question type doesn't match;
  required flag doesn't match; answer options don't match; missing requested features;
  missing bottom notices; missing Google Forms logo.
- **Dimension 3 (Completeness):** wrong output format (e.g. layout type ignored); model
  over-complicated the ask; ignored an explicit rule (e.g. style-guide colors not
  applied).
- **Dimension 4a (Aesthetics):** confusing/random emphasis; hero image unrelated to
  content; distracting background hides content; mismatched style vs. requested
  reference; bad contrast; unprofessional/garish palette; unreadable fonts; inconsistent
  styling.
- **Dimension 4b (Legibility):** content spilling out of its container; content cut off
  without indication; improper scaling on narrow/wide screens.

These map almost one-to-one onto the QI-1…QI-11 requirements in
`requirements/quality_improvements.md` — that document was written by walking this exact
checklist against the SI. When you rate a generation, use the checklist as the concrete
"why" behind a scalar score, not a substitute for it.

## 2. Groundedness in detail — the project's core promise

Groundedness (Dimension 2) is not just "looks like the original" — it is a hard product
requirement: a restyled form's submissions must land in the *same* Google Sheet as the
original form, which only works if `entry.XXXXXXXXX` field names, question types, and
required flags survive unchanged. The table below maps each rubric groundedness check to
the SI rule or code artifact that enforces it in `app/lib/gemini.ts`, verified 2026-07-19:

| Rubric check | Enforcement in `app/lib/gemini.ts` | Status |
|---|---|---|
| Question types stay the same | `buildSystemPrompt()`'s "CRITICAL — PRESERVE FORM CONTENT EXACTLY" block ("A dropdown must stay a dropdown…") + the per-question type reminder appended after the structure JSON ("Do NOT swap, change, or reinterpret any of these types") | SI-enforced only |
| Form title / description unchanged | Same CRITICAL block ("Do NOT change the form title, description…") | SI-enforced only |
| Question phrasing and answer options unchanged (verbatim) | Same CRITICAL block + closing reminder ("title, description, question text, and option labels… are READ-ONLY — copy them verbatim") | SI-enforced only — **this is the open gap**, see below |
| Placeholder text is generic, not invented (rubric: "very minor") | Rule 15 (QI-3): placeholders limited to "Your answer" / neutral format hints | SI-enforced only |
| Required-question parity | Rule 8: "Only mark a field as required if its `required` property is true… If `required: false`, it MUST remain optional" | SI-enforced only |
| Bottom notices present ("Never submit passwords…", Terms/Privacy/Contact/Report links) | Rule 18 + `buildGoogleFormsFooter(formId)` — canonical footer HTML interpolated verbatim into the SI, marked with `data-gforms-footer` | SI-enforced, footer text itself is deterministic (built by app code, not generated) |
| Google Forms wordmark present, as grey text (never an icon/logo/SVG) | Same `buildGoogleFormsFooter()` — plain text spans styled `#5f6368`, weight 500/400 | Same as above |
| Entry name routing (not a rubric line item, but the mechanism groundedness depends on) | Rule 4: "Every form input must use the exact name attribute provided (e.g. `name="entry.1234567890"`)" | SI-enforced only |

**The open gap:** every row above except the footer/wordmark is enforced *only* by SI
instruction — there is no deterministic check that Gemini actually complied. This is
exactly INC-9 in the incident record: Gemini occasionally paraphrases question or option
text despite the verbatim rules (documented as a "Known limitation" in
`documentation/architecture.md`), non-deterministically and infrequently, and a retry
usually fixes it. Prompt-strengthening (commit `f5599da`) measurably reduced but did not
eliminate it. The accepted structural fix is the QI-4/QI-6 post-generation validator
(`requirements/quality_improvements.md`) — **not started as of 2026-07-18** (confirm
current status with `grep -n "QI-4" requirements/quality_improvements.md` and
`find app/lib -iname "validate-form*"`, which currently returns nothing). Full campaign
context and the solution menu live in the sibling skill
**forms-restyler-drift-elimination-campaign** — this skill only needs you to know that
groundedness Dimension 2 currently has a real, open, non-zero failure rate, and that any
QA claim of "groundedness is solved" is false until that validator exists and eval data
backs it.

## 3. The golden eval-set inventory (verified 2026-07-19)

Ground truth: `evals/manifest.json` (37 items, aggregated from `evals/manifest-items/`
shards), `evals/style-guides/`, `requirements/eval_set_creation.md`,
`evals/tools/README.md`.

| Asset | Count / fact | Verified how |
|---|---|---|
| Eval Google Forms | 37, all `stages.verify == "done"` (publicly scrapable — the same precondition the product's own scraper needs) | `evals/manifest.json`, all 37 items |
| Style guide screenshots | 37 PNGs in `evals/style-guides/`, each also uploaded to Vercel Blob (`styleGuideUrl` set on all 37 manifest items) | file count + manifest field check |
| Published restyled generations | 68 total generation records across 34 items × 2 image configs (3 Paperform items still pending — see below) | summed `generated{}` entries across all manifest items |
| Image-model configs | Config A = `gemini-2.5-flash-image`; Config B = `gemini-3.1-flash-image-preview` | keys of each item's `generated{}` object |
| Text model used to generate eval forms | `gemini-3-flash-preview` (working-tree SI, run against local dev server per DR-1) | `evals/tools/README.md`, `requirements/eval_set_creation.md` |
| Persistence of published generations | 1-year expiry (`expiresAt` ≈ one year after generation) | sampled `generated[config].expiresAt` values |
| Eval-set Google Doc (form + style guide + prompt + A/B links per row) | v2, at `docs.google.com/document/d/1-4ee_G6DtGyIoqfizjqnqd4-BvyPxFX1UIeXoQ38Msg` | `requirements/eval_set_creation.md` |
| Manifest shards | `evals/manifest-items/<id>.json` per item, each carrying per-config `generated[<model-id>]` records (url, publishId, expiresAt, imageCount, htmlLength, durationMs) | manifest item schema inspection |

### Caveats that affect how you interpret results

- **14/37 items flagged `thinExtraction`** (verified count via `manifest.json`
  `thinExtraction: true`) — one-question-at-a-time SPA sources (Typeform, Fillout,
  Paperform) rendered only their welcome screen to the scraper, so Gemini inferred a
  plausible question set instead of extracting the real one. These have the lowest
  source fidelity of the set; if you're auditing eval results for a specific dimension,
  review these 14 first and weight surprising groundedness failures on them accordingly
  — the "original" they're compared against may itself be an inference, not a scrape.
- **5 items produced 0 images in BOTH configs** (verified by summing `imageCount` per
  item across both `generated[]` entries in `evals/manifest.json`: `fillout-onboarding-survey`,
  `fillout-software-survey`, `jotform-teacher-evaluation`, `tally-feature-request`,
  `tally-user-research`). This is intended behavior (INC-18) — the SI deliberately treats
  plain surveys as poor image candidates — not a bug to fix. For these rows, an A-vs-B
  comparison measures generation variance between two runs of the same SI, not image-model
  quality, because neither config produced an image to compare. *(Note: an earlier
  session record put this count at 9; the manifest, re-counted 2026-07-19, gives 5 —
  treat 5 as current and re-run the count above if this matters to your analysis.)*
- **3 Paperform items pending regeneration**: `paperform-client-onboarding`,
  `paperform-event-registration`, `paperform-restaurant-order` — their Google Forms exist
  and are verified, but `generated{}` is empty pending corrected style-guide PNGs from the
  form owner. Do not count these 3 in an eval run until they're regenerated (34, not 37,
  items currently have restyled output to rate).

## 4. Acceptance discipline for quality claims

No change that touches `buildSystemPrompt()`, `buildGoogleFormsFooter()`, or the
per-message style-guide text in `app/lib/gemini.ts` (i.e. any SI change) may be described
as an improvement without the following:

1. **Same items, same prompts, same style guides, generated from the SI under test.**
   An A/B must hold everything constant except the SI: the same eval-set items, the
   standard prompt (`"Redesign this form to match the attached style guide."`), and the
   same style-guide images — with generation run against the code version actually being
   evaluated. This is DR-1, the version-of-truth rule: verify which SI/code version the
   generating endpoint runs (prod = `main`; local dev = working tree) before *any* eval
   or comparison run. It exists because of INC-5 — a generation stage was about to call
   prod's `/api/generate` while the SI under test existed only on an unmerged branch,
   which would have silently rated the wrong prompt. `evals/tools/generate-restyled.mjs`
   now enforces this by construction (targets local dev, rewrites the baked submit URL to
   prod only at publish time, and refuses to publish if the rewrite matches nothing).
2. **Pilot before wide.** Any batch generation run pilots on one item first, gets
   eyeballed, then goes wide (DR-7) — batch mistakes here leave artifacts in the owner's
   real Google account and Drive, not a disposable sandbox.
3. **Measured outcomes, never "looks better to me."** A single live generation on
   `npm run dev` is necessary evidence (the change didn't break the pipeline) but is
   explicitly NOT sufficient evidence of a quality improvement — SI failures are
   non-deterministic, so one good-looking run proves nothing about the underlying rate.
   The only acceptable quality claim is a rubric-scored comparison across the eval set.
4. **Report per-dimension deltas, in stack-rank order.** State the before/after rating (or
   A-vs-B comparison) for Dimension 1 first, then 2, then 3, then 4 — never lead with an
   aesthetics win. If Dimension 1 or 2 regresses even slightly, that outweighs
   improvements on 3 or 4 regardless of how large they look; say so explicitly in the
   writeup, don't average dimensions into one number.

## 5. How a change gets validated pre-merge (and what may NOT be claimed yet)

Full merge mechanics, the change taxonomy, and the DR-1…DR-12 non-negotiables live in
**forms-restyler-change-control** (§4 there is "The SI change protocol" — read it for the
step-by-step git/PR flow). From a QA-evidence standpoint, the sequence a class-(a) SI
change must pass before it may claim anything is:

1. Requirement written first (QI-style entry in `requirements/quality_improvements.md`
   or a successor doc): problem → rubric linkage → requirement → how to address.
2. SI edits batched into one coherent revision, not dribbled — so the eval can compare
   exactly one before/after pair.
3. `tsc`/lint clean + live generation on `npm run dev`, iterated against real screenshots
   including a mobile-width viewport (necessary, not sufficient — see §4.3 above).
4. Eval A/B on the golden set (§3), rated per this rubric (§1), with per-dimension deltas
   reported in stack-rank order (§4.4).
5. Only after step 4 produces a rating pass may the change be described as validated.
   Owner sign-off is required before merge regardless (main == prod).

**Current honest state (as of 2026-07-19):** QI-1 through QI-11 in
`requirements/quality_improvements.md` are all marked "Implemented" in that doc's status
table, verified live on the dev server against a single test form
(`cupcake-workshop`) with real screenshots. **None of them have been through step 4.**
No rating pass against `evals/rater_instructions.md` has run yet on the `si-improvements`
branch's output. Do not claim, cite, or report a rubric-dimension improvement from
QI-1…11 until that rating pass exists — "implemented" and "SI-verified-live" are true and
already claimed; "rubric-validated" and "eval-A/B-validated" are not yet true and must not
be claimed. This is the single most important distinction this skill exists to enforce.

## 6. How to extend QA

- **Adding eval items** (new source forms, new style guides): mechanics belong to the
  sibling skill **forms-restyler-eval-pipeline** (`run.mjs`, manifest shards,
  `evals/sources.json`). This skill only cares that new items get the same rubric
  treatment as the existing 37 once they're built.
- **Adversarial / varied prompts per item:** explicitly out of scope for v1
  (`requirements/eval_set_creation.md`, "Out of scope (v1)": *"Varied/adversarial prompts
  per item (a later subset will exercise rubric Dimension 3)"*). The current eval set uses
  one standard prompt (`"Redesign this form to match the attached style guide."`) for
  every item, so today's A/B results say nothing about Dimension 3 robustness under
  unusual or conflicting instructions. Anyone wanting to test instruction-following depth
  needs to build that prompt-variation subset first — it does not exist yet.
- **Automated post-generation validator (QI-4/QI-6):** the accepted structural fix for the
  Dimension 1/2 gaps in §2 — deterministic, not a rubric replacement. Labeled a candidate,
  not started. Full design and campaign framing: sibling skill
  **forms-restyler-drift-elimination-campaign**.
- **LLM-as-judge / automated eval harness (FI-3 in `requirements/future_improvements.md`):**
  a candidate direction to automate the rubric itself — screenshot + validator +
  judge-model scoring per eval item, explicitly required to be multi-turn (the real
  product flow is 3+ iterative edits; single-shot evaluation misses drift-across-edits as
  a failure mode). Not built. Full menu of pipeline-level candidates (FI-1…FI-6, ranked):
  sibling skill **forms-restyler-research-frontier**.
- Whatever you build, preserve the stack ranking (§1.1) as the top-level organizing
  principle of any new scoring mechanism — an automated score that averages four
  dimensions into one number throws away the rubric's central design decision.

## When NOT to use this skill

| You actually need | Sibling skill |
|---|---|
| Running/resuming the eval pipeline, manifest mechanics, adding eval items | forms-restyler-eval-pipeline |
| Merge gates, change taxonomy, the DR-1…DR-12 non-negotiables, git/PR flow | forms-restyler-change-control |
| Writing or refactoring SI rule text itself | forms-restyler-si-engineering |
| Full incident narratives behind INC-1…INC-20 | forms-restyler-failure-archaeology |
| The question-text-drift campaign plan and solution menu | forms-restyler-drift-elimination-campaign |
| Pipeline-level candidate directions beyond the validator (FI-1…FI-6) | forms-restyler-research-frontier |
| System invariants (verbatim text, entry.* names, CORS, footer contract) | forms-restyler-architecture-contract |
| Debugging a live failure (OAuth 403, wedged dev server, submit CORS) | forms-restyler-debugging-playbook |
| Google Forms scraping/API internals, footer HTML contract details | google-forms-internals-reference |
| Writing requirements/status docs | forms-restyler-docs-and-writing |

## Provenance and maintenance

Written 2026-07-19. Sources read in full: `evals/rater_instructions.md`,
`requirements/quality_improvements.md`, `requirements/eval_set_creation.md`,
`requirements/future_improvements.md` (FI-1/FI-3 sections), `evals/tools/README.md`,
`app/lib/gemini.ts` (`buildSystemPrompt()`, `buildGoogleFormsFooter()`, rules 4, 6, 8, 9,
12, 13, 15, 16, 17, 18), `documentation/architecture.md` ("Known limitation" section),
`app/package.json` (`scripts`), `evals/manifest.json` (all 37 items, programmatically
counted), `.claude/skills/forms-restyler-change-control/SKILL.md` §4.

Volatile facts to re-verify before relying on them:

| Fact (as of 2026-07-19) | Re-verify with |
|---|---|
| 37/37 eval forms verified scrapable | `python3 -c "import json;d=json.load(open('evals/manifest.json'));print(sum(1 for i in d['items'].values() if i['stages'].get('verify')=='done'))"` |
| 14 `thinExtraction` items | `python3 -c "import json;d=json.load(open('evals/manifest.json'));print(sum(1 for i in d['items'].values() if i.get('thinExtraction')))"` |
| 5 items with 0 images in both configs | `python3 -c "import json;d=json.load(open('evals/manifest.json'));items=d['items'].values();print(sum(1 for i in items if len(i.get('generated',{}))==2 and all(v.get('imageCount')==0 for v in i['generated'].values())))"` |
| 68 total published generations | `python3 -c "import json;d=json.load(open('evals/manifest.json'));print(sum(len(i.get('generated',{})) for i in d['items'].values()))"` |
| 3 Paperform items still pending | `python3 -c "import json;d=json.load(open('evals/manifest.json'));print([i for i,v in d['items'].items() if 'paperform' in i and not v.get('generated')])"` |
| QI-4/QI-6 validator still not started | `grep -n "QI-4" requirements/quality_improvements.md; find app/lib -iname "validate-form*"` |
| No test/CI scripts | `grep -n "scripts" -A5 app/package.json; ls .github 2>/dev/null` |
| SI rule numbers unchanged (4, 8, 15, 18 etc.) | `grep -n "^[0-9]\+\." app/lib/gemini.ts` (inside `buildSystemPrompt()`) |
| Rubric dimension order and stack rank | `grep -n "^Dimension\|stack-ranked\|should be the primary consideration" evals/rater_instructions.md` |
