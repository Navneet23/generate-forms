---
name: forms-restyler-research-frontier
description: Load when planning what to work on next on Forms AI Restyler, evaluating whether an idea is novel or already considered, scoping a new quality/architecture bet, or asked to "advance the state of the art" / "what should we build next" / "has anyone thought about X" here. Maps every open problem where this project could push past its current quality ceiling — grounded in requirements/future_improvements.md (FI-1..FI-14), requirements/quality_improvements.md, requirements/post_eval_quality_improvements.md, V3/V4 roadmap docs, and the 37-item eval set. Not for executing the drift-elimination campaign (forms-restyler-drift-elimination-campaign), not for SI mechanics (forms-restyler-si-engineering), not for running the eval pipeline (forms-restyler-eval-pipeline), not for judging whether a change is already validated (forms-restyler-validation-and-qa).
---

# Forms AI Restyler — Research Frontier

**Update 2026-07-19 (post human-rating analysis):** two newer registries extend
this map and take precedence where they overlap: (a)
`requirements/post_eval_quality_improvements.md` — themes T1–T8 from the first
human rating pass with detailed, prioritized fix specs (SI rule pack,
interaction harness, layout extraction, widget/image rules, two-mode LLM
judge); (b) `requirements/future_improvements.md` now runs FI-1..FI-14 — the
seven added entries (FI-8 structured style facts, FI-9 surgical retries, FI-10
branching forms, FI-11 variance measurement, FI-12 prod telemetry, FI-13
injection hardening, FI-14 a11y/page-weight) each carry implementation-level
detail. Check both before claiming an idea is new; the problem write-ups below
predate them.

This is the map of open problems, not a task list for any one of them. Each
problem below has its own future — pick one, then hand off to the skill that
actually executes it (SI change → `forms-restyler-si-engineering` +
`forms-restyler-change-control`; new pipeline code →
`forms-restyler-architecture-contract`; eval mechanics →
`forms-restyler-eval-pipeline`). This skill's job is to stop you from
re-deriving a problem statement that's already written down, from claiming
novelty for something already spec'd, and from proposing a quality win with
no way to prove it happened.

**North star (owner, 2026-07-19):** *"generate highest quality that can be
independently validated with evals automatically."* Read that sentence twice —
it has two clauses, not one. A change that raises quality but adds no way to
measure it is half the job. A change that adds measurement but nothing to
measure is busywork. Weigh every problem below against both halves.

## When NOT to use this skill

| You are... | Use instead |
|---|---|
| Executing the question-text-drift fix specifically | `forms-restyler-drift-elimination-campaign` |
| Editing `buildSystemPrompt()` / SI rules in `app/lib/gemini.ts` | `forms-restyler-si-engineering` |
| Running `evals/tools/*.mjs`, adding an eval item, fixing pipeline OAuth/API errors | `forms-restyler-eval-pipeline` |
| Deciding whether a change already merged is "validated" / reading rubric results | `forms-restyler-validation-and-qa` |
| Checking what invariants a change must preserve (verbatim text, `entry.*`, CORS, etc.) | `forms-restyler-architecture-contract` |
| Making the actual commit/PR/merge/deploy for any of the above | `forms-restyler-change-control` |
| Digging into *why* a past incident happened before proposing a fix | `forms-restyler-failure-archaeology` |

## Maturity labels used below

Every idea here is **unproven by definition** — that's what "frontier" means.
Each problem is tagged:

- **spec'd** — a requirements doc already describes the approach in detail (FI-N).
- **candidate** — direction is clear, implementation isn't designed yet.
- **sketch** — this skill's own addition, not in any requirements doc; least mature.

No claim in this file should be read as "decided" or "in progress" unless a
requirements doc or the manifest says so explicitly — cross-check
`requirements/quality_improvements.md`'s status table (dated 2026-07-18) before
telling anyone something is done.

---

## The shared asset: what makes this project's evals unusual

Before problem-by-problem detail, the asset every problem below leans on:

- **37 eval-set items** (`evals/sources.json`), each with a scraped
  `FormStructure` in `evals/manifest-items/<id>.json` (`.structure`).
- **68 already-generated, already-persisted restyled forms** — 34 items × 2
  image-model configs (Config A = `gemini-2.5-flash-image`, Config B =
  `gemini-3.1-flash-image-preview`; text model `gemini-3-flash-preview`). 3
  Paperform items (`paperform-client-onboarding`, `paperform-event-registration`,
  `paperform-restaurant-order`) are pending corrected style-guide PNGs — verified
  by reading `evals/manifest.json` directly on 2026-07-19 (37 items, 68
  `generated[<config>].status === "done"` entries, 3 items with no `generated`
  key at all).
- Each generation's URL persists **1 year** (`extend` sets a 365-day TTL —
  `app/lib/store.ts` `EXTENDED_TTL_SECONDS`), e.g.
  `evals/manifest-items/crossfit-virtuosity-feedback.json` →
  `generated["gemini-2.5-flash-image"].url` =
  `https://app-red-phi-88.vercel.app/f/7fapZJPAcx`, `expiresAt`
  `2027-07-18T17:54:56.376Z`. These are real, live, loadable pages today — not
  fixtures you'd have to regenerate to experiment on.
- **A human rubric** (`evals/rater_instructions.md`, 171 lines): 4 stack-ranked
  dimensions (functionality & stability, groundedness, completeness &
  instruction-following, visual aesthetics & layout), each with a named
  failure-mode checklist and a 4-to-5-point per-model scale plus a 1–7 A-vs-B
  comparison scale.
- **What's missing (as of 2026-07-19):** the human rating pass itself hasn't
  been run yet (see the Remaining section of `requirements/eval_set_creation.md`; `quality_improvements.md`'s
  status table says "Full eval-set run against the rubric still pending"). This
  matters for Problem 1 specifically — you cannot calibrate a judge against
  ratings that don't exist yet.

This combination — deterministic source structure + paired A/B generations +
a written rubric — is the rare part. Most "should we add LLM-as-judge" efforts
start from zero generations and no rubric. This project starts with both.

---

## Problem 1 — Automated eval / LLM-as-judge (FI-3) — spec'd

**Why the current approach fails:** quality is measured only by a human rating
session against `evals/rater_instructions.md`, which hasn't even been run once
yet end-to-end. Every SI change (`f5599da` being the most recent example) is
validated by "generate on the dev server and eyeball it" — there is no
regression signal. General SOTA LLM-as-judge setups are unproven *for this
specific rubric*: nobody has written a judge prompt calibrated against this
project's 4-dimension, failure-mode-checklist rubric, and generic
image-quality judges don't know what "Google Forms footer wordmark present" or
"entry.* routing intact" mean.

**This project's asset:** the 68 persisted generations are exactly the corpus
a judge needs — real URLs, paired by item and by config, with the prompt and
style guide that produced each one recorded in the manifest shard. Once the
human rating pass (remaining-work item 2) lands, you have ground truth to
correlate a judge against on the *same* items, not a held-out synthetic set.

**First three steps in this repo:**
1. Read `evals/rater_instructions.md` in full (already done for this skill;
   note the exact dimension wording — a judge prompt built from anything looser
   will not be comparable to the human pass) and confirm where the human
   ratings will be recorded before building anything — check whether that's a
   new file (e.g. `evals/ratings.json`) or a column in the Drive doc
   (`docs.google.com/document/d/1-4ee_G6DtGyIoqfizjqnqd4-BvyPxFX1UIeXoQ38Msg`);
   without a settled location you cannot compute correlation later.
2. Prototype a judge script following the existing `evals/tools/lib/` module
   pattern (see `evals/tools/lib/manifest.mjs`, `evals/tools/lib/env.mjs` for
   the house style) — e.g. `evals/tools/judge.mjs` that reads one manifest
   item's `generated[<config>].url`, renders or screenshots it, and calls a
   model with the rubric text as instructions, emitting the same per-dimension
   scale the rubric defines. Do this as a read-only prototype against 2-3
   already-persisted URLs before touching the full 68.
3. Once the human pass exists, run the judge over every item that has both a
   human rating and a persisted generation, and compute agreement (e.g. exact
   match or ordinal distance) per dimension — start with the crossfit and
   atelier-eva items already inspected in this session
   (`evals/manifest-items/crossfit-virtuosity-feedback.json`,
   `evals/manifest-items/atelier-eva-tattoo.json`) since their `generated`
   blocks are already verified complete.

**You have a result when:** judge per-dimension scores correlate with the
human rating pass, on the same items, above a threshold agreed with the rubric
owner. **No numeric threshold exists in any repo doc as of 2026-07-19** — that
number is an open decision, not something to invent here. Until it's set,
treat "the judge and the human rank the same two configs the same direction on
a majority of the 34 items with both ratings" as the working bar to clear
before claiming anything stronger.

---

## Problem 2 — Deterministic form skeleton + AI styling (FI-1) — candidate

**Why the current approach fails:** Gemini writes the entire HTML page —
structure and style together — so every generation re-risks question text,
`entry.*` names, and submit wiring (this is exactly INC-9, the open drift
campaign target). Prompt-only fixes have plateaued: commit `f5599da`
strengthened SI language and reduced but did not eliminate drift, and it's a
non-deterministic failure — you cannot prompt away non-determinism.

**Tension called out in `future_improvements.md` itself:** a fixed skeleton
trades away layout freedom. SI rule 13 (`app/lib/gemini.ts` line ~152, "LAYOUT
CHOICE: if the creator's request or style guide specifies or clearly implies a
layout... follow it... If no layout is specified, choose whichever layout best
fits") and rule 14 ("QUESTION-BY-QUESTION LAYOUT RULES") both assume Gemini is
free to choose and construct the DOM shape, not just decorate a fixed one. A
naive fixed skeleton forecloses "fully custom step components" — the FI-1 doc's
own mitigation is "let Gemini emit wrapper structure around skeleton fragments
rather than a single fixed DOM," which is itself an unsolved design problem,
not a given.

**This project's asset:** `FormStructure` (`app/lib/scraper.ts`, `~line 23`)
is already a clean, typed, deterministic intermediate representation — title,
description, and a `questions[]` array with `entryId`, `type`, `required`,
`options`. A skeleton generator has real input to build from today, no new
scraping needed. And the 68 persisted generations are the pre-change baseline
for Dimension 4 (aesthetics) — you don't need to regenerate the "before" half
of the A/B.

**First three steps in this repo:**
1. Read the current output contract: `app/lib/gemini.ts` rules 1-5 (raw-HTML-only,
   inline CSS/JS, exact `entry.` names, fetch POST to `submitUrl`) — a skeleton
   approach changes what these rules even mean (Gemini would no longer own the
   `<input name="entry...">` elements at all).
2. Design the skeleton/theme boundary as a throwaway experiment (not on `main`
   — `main == prod`, DR-5) that renders `FormStructure` into fixed input
   markup with correct `entry.*` names, verbatim text, and the canonical
   footer (`buildGoogleFormsFooter()`), leaving CSS classes and a wrapping
   layout region for Gemini to fill.
3. Pilot on exactly one item first (DR-7, pilot-first rule) — pick one with an
   already-approved form so there's no risk of orphaning a Drive artifact
   (check `orphanedForm` / manifest shard state per DR-8 before touching
   anything), generate with both the old full-HTML approach and the new
   skeleton approach, and compare by eye before any formal A/B.

**You have a result when:** across the pilot set, the QI-4-style drift check
(question/option text and `entry.*` diffed against `structure`) reports **zero
violations by construction** (not "fewer" — the whole point of this approach is
that drift becomes structurally impossible for text Gemini never touches), AND
rubric Dimension 4 (aesthetics) rating is **not significantly worse** in an A/B
against the current approach on the same items. Both halves are required —
"drift-free but ugly" is not the win condition FI-1 describes.

---

## Problem 3 — Vision self-review loop ("render, look, fix") (FI-2) — candidate

**Why the current approach fails:** no static validator can catch a visual
failure — bad contrast over a gradient, clipped text, a broken mobile layout.
These are exactly rubric Dimension 4's failure modes, and today they're caught
only by a human looking at a screenshot during an eval session.

**Infrastructure dependency — read before scoping this:**
`documentation/screenshot-production.md` states the screenshot route
(`app/app/api/screenshot/route.ts`) is only **"Partially working"** on Vercel
production — `@sparticuz/chromium` hits binary-size (50MB compressed),
execution-timeout (10s on free tier vs. a 15s page-load timeout already set in
the route), and memory (1024MB) limits, with a documented `501` fallback. FI-2
assumes "screenshot infrastructure already exists" — true for **local dev**
(full `puppeteer` Chrome binary), false for the prod path this same
infrastructure would need if self-review ran as part of a live generation.
Scope FI-2 to the local/eval pipeline first; do not assume it silently works
in prod without addressing screenshot-production.md's Option A/B/C.

**This project's asset:** the eval pipeline already renders pages headlessly
today (`evals/tools/README.md`: "renders the page, captures a hero screenshot")
via the same local-puppeteer path that works reliably — reuse it rather than
inventing a second render pipeline.

**First three steps in this repo:**
1. Read `app/app/api/screenshot/route.ts` and the eval pipeline's extraction
   code under `evals/tools/lib/` to find the existing local-puppeteer render
   pattern and reuse its launch/navigate/screenshot logic rather than
   duplicating it.
2. Prototype a local-only script that takes one generation's HTML (fetch a
   persisted `generated[<config>].url` from a manifest shard, or a fresh
   `/api/generate` response) and renders it at desktop and mobile widths,
   producing two PNGs — no Gemini call yet, just prove the render step works
   against a real generation.
3. Feed those PNGs plus a critique checklist copied verbatim from
   `evals/rater_instructions.md` Dimension 4 ("Visual Legibility... Text
   legibility... Container and text boundary control... Layout Scaling...
   Typography") into a vision-capable Gemini call, and sanity-check the
   critique against 2-3 generations you already know (from prior manual
   inspection, e.g. via `mcp__claude-in-chrome`) have a Dimension-4 defect.

**You have a result when:** on a small labeled set of generations with known
Dimension-4 defects (curate this by hand first — nothing in-repo is labeled
yet), the self-review pass flags a defined majority of them AND, when the
critique is used to drive a corrected regeneration, the corrected version
rates measurably better on Dimension 4 than the uncorrected one — via Problem
1's judge once it exists, or a human comparison rating in the interim.

**Pairs with:** Problem 4 (FI-6) — same headless render session can host both
the visual critique and the runtime smoke test in one pass, per FI-2/FI-6's
own stated pairing.

---

## Problem 4 — Runtime smoke test of generated JS (FI-6) — candidate

**Why the current approach fails:** there is **no automated test suite and no
CI at all** in this repo (verified: no `test` script in `app/package.json`, no `.github/`) — `app/test_redis.mjs` and
`app/test_persistence.mjs` are ad-hoc scripts, not a harness. A static
validator (QI-4, not yet built — `quality_improvements.md` status: "⬜ Not
started") can never catch a JS runtime error that blanks the page, which is
the rubric's "Critical Failure" tier under Dimension 1 — the single
highest-priority dimension in the stack-ranking.

**This project's asset:** `evals/rater_instructions.md` Dimension 1 gives
exact, encodable pass/fail language ("Navigation has to work," "Submit has to
work," "Form shows a blank white screen" = Critical Failure) — and the 68
already-persisted generation URLs let you get a **baseline defect rate today,
retroactively, with zero new generations**, before writing a single line of
new pipeline code.

**First three steps in this repo:**
1. Reuse the render pattern from Problem 3 rather than building a second one —
   if Problem 3 isn't started yet, this step becomes "build the minimal shared
   piece first": headless-navigate to one persisted URL and capture console
   output.
2. Write a script that walks `evals/manifest.json`'s `items`, for each
   `generated[<config>].url` (68 total today) loads it headlessly, and
   asserts: zero console errors, a `<form>` element exists, next/back controls
   are present if the layout is question-by-question. Do **not** actually
   submit — the real submit route (`app/app/api/submit/[formId]/route.ts`)
   POSTs to a real Google Sheet via the shared prod Redis/Blob (DR-2,
   shared-state rule); mock or intercept the `fetch` instead of letting a
   smoke test write real rows.
3. Run this against all 68 persisted URLs first (no new generation cost) to
   establish the current runtime-failure baseline, cross-referencing any hits
   against items already flagged `thinExtraction: true` (14/37 per INC-10) to
   see whether low source fidelity correlates with runtime breakage.

**You have a result when:** the smoke test runs against the 68 persisted
generations and produces a defect list that a human spot-check confirms
matches real Dimension-1 Critical/Major failures on the same items — i.e. the
result is "the tool's flags agree with manual inspection on a sample," not
merely "the script executes without throwing."

---

## Problem 5 — Scraper depth (FI-5) — candidate

**Why the current approach fails:** `app/lib/scraper.ts`'s `FormStructure`
captures only title, description, and 8 flat question types (`short_answer`,
`paragraph`, `multiple_choice`, `checkboxes`, `dropdown`, `linear_scale`,
`date`, `time` — confirmed via `TYPE_MAP` in `scraper.ts`). It drops
per-question descriptions, section/page breaks, and question-attached images.
Groundedness (Dimension 2, the #2-priority rubric dimension) is judged against
the **original form** — if any eval-set source used these features, the
groundedness failure is baked in before Gemini ever runs, and no SI or
generation-side change can fix it.

**Known risk (see `forms-restyler-architecture-contract`, weak points):** the scraper parses `FB_PUBLIC_LOAD_DATA_`,
an undocumented internal Google structure (see
`google-forms-internals-reference` skill) — already fragile enough to have
caused INC-11 (unescaped `&`/`<`/`>` breaking eval verification). Extending
what's parsed out of it raises the same fragility surface, not just adds
fields.

**This project's asset:** the 37-item eval set is the audit corpus FI-5's own
doc calls for ("First step: Check the eval-set forms for these features to
size the actual impact") — you don't need to speculate, you can check real
data that's already scraped and sitting in `evals/manifest-items/*.json`.

**First three steps in this repo:**
1. Do FI-5's own prescribed first step: inspect `evals/manifest-items/*.json`
   `.structure` blocks (or re-fetch `FB_PUBLIC_LOAD_DATA_` from each
   `resolvedFormUrl`) for evidence the source form actually used
   per-question descriptions, sections, or attached images — e.g.
   `grep -l '"description"' evals/manifest-items/*.json` as a starting probe,
   then manually verify a sample of hits against the live original form.
2. Cross-reference any hits against the 14 items already flagged
   `thinExtraction: true` (INC-10) — those items' "real" structure is already
   unknown/inferred, so scraper-depth gains there are moot until thin
   extraction itself is addressed; prioritize auditing the 23 non-thin items
   first.
3. If the audit finds material impact, extend `FormStructure` (add optional
   `description`/section fields) behind a single-item pilot (DR-7): re-run
   `node run.mjs --only=<id>` (from `evals/tools/`) on one item to confirm
   extraction still works before any wider rerun, and confirm the item isn't
   one with an already user-approved form before re-scraping (DR-8 is about
   `--force` on generation, but re-scraping the *source* is lower-risk than
   recreating the *Drive form* — verify which stage you're touching).

**You have a result when:** the audit produces a concrete count of eval-set
items exhibiting sections/descriptions/images (this number could legitimately
be zero — that's a valid, useful result, not a failure to find something).
If nonzero, extending the scraper to carry the missing content should raise
the groundedness rating specifically on the affected items in a before/after
comparison — measured via Problem 1's judge once available, or manual rating
otherwise.

---

## Problem 6 — Multi-image coherence (FI-7) and Google Fonts carve-out (FI-4) — candidate, smaller

Both verified **not implemented** as of 2026-07-19 via direct grep of
`app/lib/gemini.ts` and `app/lib/image-gen.ts`:

- **FI-4 (Google Fonts):** no `fonts.googleapis.com` / `fonts.gstatic.com`
  reference exists anywhere in the SI. Rule 2 in `gemini.ts` still says "No
  external stylesheets" with no carve-out. `future_improvements.md` ranks this
  its own suggested sequencing position **3** — "trivial effort, immediate
  aesthetics gain" — because it's a single SI rule addition, not new code.
  Note the doc's own caution: verify the eval set renders before/after, and
  that Google Fonts links don't break inside the sandboxed `srcdoc` preview
  (published forms at `/f/{id}` have no such restriction, but the in-app
  preview iframe might).
- **FI-7 (multi-image coherence):** no style-descriptor parameter exists on
  the `generate_image` function declaration (`app/lib/gemini.ts` ~line 54) —
  confirmed by reading the full declaration and its guidelines text (~line
  170-174), which describes each call independently with no persistence of a
  chosen palette/rendering-style across calls within one generation.

**This project's asset for FI-7 specifically:** INC-18 already establishes
that 5/34 eval items produce zero images in both configs by design (the SI
tells Gemini plain surveys don't need images) — so any coherence metric must
be scoped to the ~29 image-bearing items, and the 68 persisted generations
already show real multi-image outputs to audit for coherence failures without
generating anything new.

**First three steps (FI-4, cheapest, do first):**
1. Read SI rule 2 in `app/lib/gemini.ts` and draft the carve-out sentence
   (allow `<link>` to `fonts.googleapis.com`/`fonts.gstatic.com`, nothing
   else) — this is `forms-restyler-si-engineering` territory once you're ready
   to actually edit the rule.
2. Generate one pilot form locally with the amended rule and check it renders
   in both the in-app `srcdoc` preview and a published `/f/{id}` page.
3. Compare Dimension 4 by eye against the same item's un-amended baseline
   already sitting in the manifest.

**First three steps (FI-7):**
1. Audit the ~25 image-bearing generations among the 68 persisted URLs for
   visible style mismatches between multiple images in the same form (palette
   clash, rendering-style clash) — this sizes whether it's a real problem or a
   theoretical one before adding code.
2. If sized as real, design the style-descriptor field as an addition to the
   `generate_image` function declaration schema in `gemini.ts`, filled once by
   the model and threaded through `app/lib/image-gen.ts` so later calls append
   it to the prompt.
3. Pilot on one image-bearing item, compare multi-image coherence before/after
   by eye.

**You have a result when:** FI-4 — the eval set renders with fonts applied and
Dimension 4 ratings do not regress on any item (font carve-outs are additive,
regression would indicate a real bug, e.g. broken preview). FI-7 — the audited
mismatch rate among image-bearing generations drops after the descriptor is
added, measured on the same item set before/after.

---

## Problem 7 — Roadmap directions from V3/V4 (multi-model picker, template style definitions) — spec'd (roadmap), positioned against the north star

`requirements/V3_REQUIREMENTS.md` (model picker across Claude Opus/Sonnet/Haiku
+ Gemini 2.0 Flash/1.5 Pro, template gallery with reference images) and
`requirements/V4_REQUIREMENTS.md` (templates upgraded to explicit `style.json`
definitions instead of AI-reinterpreted reference images) are **not** research
problems in the same sense as FI-1..FI-7 — they're scoped, dated roadmap specs
with their own tradeoff tables already written. This skill's job is not to
re-derive them but to say how they relate to the north star.

**The relationship:** every one of V3/V4's features **multiplies the
configuration space that needs quality validation**:

- V3's model picker means the SI needs "a per-provider system prompt variant
  rather than a single shared one" (V3 doc, Technical Challenge 3, explicitly
  calling this "ongoing quality work, not a one-time task") — every model
  choice is now a separate thing that can drift, break footer fidelity, or
  fail groundedness independently.
- V3's template gallery (8-12 templates at launch) and V4's `style.json`
  definitions each add another axis: model × template × style-guide-or-not ×
  layout choice. The V3 doc's own "Interaction Between V3 Features" table
  already shows this combinatorial pressure (template+style-guide precedence
  rules, per-model image-count degradation).
- **This is exactly why Problem 1 (FI-3, automated eval) has to come before
  or alongside V3, not after.** A single human rating pass across 37 items ×
  2 image configs already hasn't been run yet (see the asset section above).
  Multiply by 5 models and 8-12 templates and manual rating stops scaling
  entirely — the north star's "independently validated... automatically"
  clause is not optional once V3 lands, it's load-bearing.

**First three steps in this repo (not to build V3/V4 — to prepare for them):**
1. When Problem 1's judge prototype exists, design its interface to take a
   model identifier as a parameter from the start, even though only Gemini is
   wired up today — retrofitting multi-model judging later is more expensive
   than building it in.
2. Read V3's Technical Challenge 3 ("Prompt tuning is model-specific") against
   the current single-SI reality in `app/lib/gemini.ts` — the file has no
   per-provider branching today; that's the actual gap V3 would need closed,
   not just new API client code.
3. Treat V4's `style.json` schema (shown in full in `V4_REQUIREMENTS.md`) as a
   candidate structured-context format worth reusing for *this* project's own
   experiments (e.g. Problem 2's skeleton/theme boundary could borrow the same
   shape for what Gemini is and isn't allowed to vary) — it's a reusable
   design, not V3/V4-exclusive.

**You have a result when:** this problem doesn't get its own milestone —
it's satisfied when Problem 1's automated eval exists and demonstrably scales
past a single model/config axis (i.e. it was designed to take a model
parameter, per step 1, not hardcoded to Gemini).

---

## Problem 8 (this skill's addition) — eval-artifact durability as a first-class concern — sketch

Not in any FI/QI doc; flagged here as this skill's own addition because every
problem above (1, 3, 4, 6) leans on the 68 persisted generation URLs staying
alive and unchanged. `app/lib/store.ts` gives them a 365-day TTL via `extend`,
but:
- Local dev and prod share the same Redis/Blob (DR-2) — any future sweeper run,
  bulk delete, or accidental `--force` re-generation (INC-3, INC-4 already
  happened once) can silently invalidate the baseline every research problem
  above assumes is stable.
- Nothing in the manifest schema currently distinguishes "this generation is a
  frozen research baseline, do not regenerate" from "this generation is stale,
  feel free to `--force`."

**First three steps:** (1) read `evals/tools/README.md`'s state-model section
and `app/lib/store.ts`'s TTL constants to confirm there's no existing
"protect this one" flag; (2) if Problem 1 or 3 starts depending on specific
persisted URLs as a fixed calibration/regression set, record which item+config
pairs are load-bearing (e.g. a short list in whatever script consumes them,
not a new schema field until proven necessary); (3) before running any
`--force` or sweeper-adjacent operation, check that list against DR-8's
existing manifest-check discipline.

**You have a result when:** a research script that depends on specific
persisted URLs fails loudly (not silently returns stale/wrong data) if one of
those URLs has expired or been regenerated out from under it.

---

## External positioning

What may be said publicly about this project's quality, and when:

| Claim | Allowed when |
|---|---|
| "We have an eval set for this product" | Always — the 37-item set and rubric are real and dated. |
| "Generation X scores better than generation Y" | Only after a completed rating pass (human, per `rater_instructions.md`, or a judge validated per Problem 1) on the specific items compared — never from eyeballing alone. |
| "Our forms are grounded / drift-free" | Never until the QI-4 validator (or Problem 2's skeleton approach) exists and has been run against evidence — INC-9 is an **open** issue, not a solved one, as of 2026-07-19. |
| "We use LLM-as-judge for quality" | Only after Problem 1's correlation-vs-human-pass milestone is met — a judge that hasn't been calibrated is not evidence of anything, it's an unvalidated opinion generator. |
| Reproducibility standard for any internal or external quality claim | A manifest reference (item id + config), the persisted generation URL, and a doc (rating record or judge output) that a third party could independently open and check. "I looked at it and it seemed good" does not meet this bar. |
| Publishing/republishing eval-set source content | **Do not.** The eval set derives from real competitor forms (Typeform, Fillout, Paperform, etc. — see `evals/sources.json`) scraped and recreated for internal research. Treat the scraped content, screenshots, and recreated forms as internal research material only — they are not this project's content to republish externally. |

---

## Sequencing recommendation

| Order | Problem | Unlocks |
|---|---|---|
| 1 | Problem 1 — automated eval / LLM-as-judge (FI-3) | Everything else. No other problem's "you have a result when" clause is checkable without either a human rating pass or a working judge. Also the literal precondition for Problem 7's roadmap features to stay measurable. |
| 2 | Problem 4 — runtime smoke test (FI-6) | Cheapest deterministic signal; runs against the 68 URLs that already exist with zero new generation cost; establishes Dimension-1 baseline before anything else changes generation behavior. |
| 3 | Problem 3 — vision self-review (FI-2) | Shares the headless-render session with Problem 4 (build once, use twice); gated on scoping around `screenshot-production.md`'s prod limitation first. |
| 4 | Problem 6 (FI-4 half only — Google Fonts) | Independent, trivial, no dependency on anything above; can run in parallel with 1-3 if someone has spare cycles. |
| 5 | Problem 5 — scraper depth (FI-5) | Its own first step (audit the 37 items) has no dependencies and can start anytime; but sizing "is this worth it" and confirming a fix worked both need Problem 1's measurement to be credible. |
| 6 | Problem 6 (FI-7 half — multi-image coherence) | Same reasoning as FI-5: audit step is free, validating a fix needs Problem 1. |
| 7 | Problem 2 — deterministic skeleton (FI-1) | Biggest bet, explicitly deferred in `future_improvements.md` until "the QI-4 validator still leaves a meaningful drift/functionality tail in eval results" — i.e. it's a fallback if the (separate, not-this-skill) drift-elimination campaign's validator approach doesn't fully close the gap. Needs Problem 1 to prove the Dimension-4 trade-off claim either way. |
| 8 | Problem 7 — V3/V4 roadmap | Not sequenced as "do this Nth" — it's a standing pressure that makes Problem 1 more urgent the closer V3 gets to being built, not a milestone of its own. |
| — | Problem 8 — eval-artifact durability (sketch) | Cross-cutting; do its 3 steps whenever any problem above first starts depending on specific persisted URLs, not on a fixed date. |

---

## Provenance and maintenance

- Written 2026-07-19, grounded directly in: `requirements/future_improvements.md`
  (FI-1..FI-7, read in full), `requirements/quality_improvements.md` (QI-1..QI-11
  and its 2026-07-18 status table, read in full), `requirements/V3_REQUIREMENTS.md`
  and `requirements/V4_REQUIREMENTS.md` (read in full), `documentation/screenshot-production.md`
  (read in full), `evals/rater_instructions.md` (read in full), and the retiring
  maintainer's session records (not preserved in-repo; incident narratives are
  canonicalized in `forms-restyler-failure-archaeology`).
- Verified directly against the repo, not just against docs describing it, on
  2026-07-19: `evals/manifest.json` (37 items, 68 `generated[*].status ===
  "done"` entries across 34 items, 3 Paperform items with no `generated` key —
  confirmed by script, not taken on faith from session notes);
  `app/lib/scraper.ts` (`FormStructure`/`FormQuestion` shape, `TYPE_MAP`'s 8
  question types); `app/lib/gemini.ts` (rule numbering 1-18, confirmed rule 13
  = layout choice / rule 14 = question-by-question, confirmed no Google Fonts
  carve-out exists, confirmed `generate_image` has no style-descriptor
  parameter); `app/lib/store.ts` (TTL constants, 365-day extend); one full
  `evals/manifest-items/*.json` shard's `generated` block (URL + `expiresAt`
  shape); `evals/tools/generate-restyled.mjs` (CLI flags, config keys); `app/package.json`
  scripts (`dev`/`build`/`lint`, no `test` script — confirms "no automated test
  suite" as a repo fact, not just a session-note claim).
- Not independently verified: whether any numeric judge-correlation threshold
  has been agreed by the rubric owner outside this repo (Problem 1) — flagged
  as an open decision rather than assumed.
- Re-verify before reuse: the 68/37/3 generation counts and the "not
  implemented" status of FI-4/FI-7 (Problem 6) are point-in-time facts from
  2026-07-19 — re-run the same `evals/manifest.json` script and the same
  `grep` checks against `app/lib/gemini.ts`/`app/lib/image-gen.ts` before
  citing them again, since both are exactly the kind of state this project
  changes quickly (the 68/68 generations were completed the day before this
  writing).
- Maintenance rule: when a problem below graduates from candidate/sketch to
  spec'd-and-scheduled (i.e. it gets its own requirements doc or QI/FI entry),
  update this file's status line for that problem rather than leaving two
  documents disagreeing about its maturity.
