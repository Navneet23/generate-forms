---
name: forms-restyler-drift-elimination-campaign
description: Load when tasked with fixing Forms AI Restyler question-text/option-label drift, building the groundedness/submit-wiring validator (QI-4/QI-6 in requirements/quality_improvements.md), measuring generation quality with the eval set instead of eyeballing, wiring a "validate" step into /api/generate, or making generation quality "measurable and automatic" without a human rater. Triggers — "fix question text drift", "Gemini paraphrased a question", "build the QI-4 validator", "validate-form.ts", "groundedness check", "drift rate", "eval this SI change automatically", "LLM judge for forms", "why does groundedness keep failing", "check-drift script".
---

# Forms AI Restyler — Drift Elimination Campaign

This is the executable runbook for the project's hardest live problem: Gemini
occasionally paraphrases question text or option labels despite the system
instruction's (SI) verbatim rules. It is written so a zero-context engineer or
model can run the whole campaign — measure, build, wire in, validate, promote
— without the person who diagnosed it.

**Read `forms-restyler-architecture-contract` first if you haven't** — this
campaign edits files governed by invariants (a) verbatim content, (b) entry
names, (i) the SSE step contract — that skill states them; this skill assumes
you know them and will call out exactly which ones each phase touches.

All facts below verified against the repo, branch `si-improvements`, as of
2026-07-19 (see "Provenance and maintenance").

## When NOT to use this skill

| You actually need | Use instead |
|---|---|
| Writing/refactoring SI rule *text* in general (not this campaign) | `forms-restyler-si-engineering` |
| The mechanics of running `run.mjs` / `generate-restyled.mjs` | `forms-restyler-eval-pipeline` |
| General rubric/rating methodology not specific to drift | `forms-restyler-validation-and-qa` |
| The actual PR/merge/branch process this campaign must route through | `forms-restyler-change-control` |
| General-purpose analysis scripts (this campaign assumes/asks for `scripts/check-drift.mjs` living there) | `forms-restyler-analysis-toolkit` |
| Debugging an unrelated live failure (OAuth, wedged dev server, CORS) | `forms-restyler-debugging-playbook` |
| Full invariant list / "can I change X" for app code in general | `forms-restyler-architecture-contract` |
| Google Forms' internal data format (`FB_PUBLIC_LOAD_DATA_`, entry IDs) | `google-forms-internals-reference` |

---

## 1. The problem, precisely

Gemini (`gemini-3-flash-preview`, `app/lib/gemini.ts` `MODEL_ID`) sometimes
rewrites question text or option labels instead of copying them verbatim from
`FormStructure`, e.g.:

> "Rate your current baking/decorating experience." → "Rate your current
> experience."

This is **non-deterministic and infrequent** — a retry usually produces
correct output. It violates rubric **Dimension 2 (Groundedness)**
(`evals/rater_instructions.md`), the harshest-graded dimension after
functionality, and it is the product's core promise: a respondent's answer
must land in the *original* Google Sheet under the *original* question. This
is incident **INC-9** in `forms-restyler-failure-archaeology` and the "Known limitation"
section of `documentation/architecture.md` (line ~229).

**Prompt strengthening has already been tried and plateaued.** Commit
`f5599da` ("Fix form content rewriting: strengthen prompt to preserve
question text verbatim") added the SI's "CRITICAL — PRESERVE FORM CONTENT
EXACTLY" block and rule 1/7 language (`app/lib/gemini.ts` lines ~124–129,
~132, ~142). It reduced drift but did **not** eliminate it. This is stated
explicitly in `requirements/quality_improvements.md` QI-4: "Prompt language
has plateaued... drift persists."

**Owner's stated goal (2026-07-19, verbatim):** "generate highest quality
that can be independently validated with evals automatically." Two halves:
(1) stop the drift structurally, (2) make quality measurable without a human
rater. This campaign delivers both, in that order.

### Why prompt-only fixes are fenced off

Non-deterministic sampling failures cannot be prompted away — you can lower
the *rate* with clearer instructions (which `f5599da` already did), but you
cannot drive it to zero with text alone, because the failure is a property of
sampling, not of instruction clarity. Two rounds of prompt-only effort
(the original SI language, then `f5599da`'s strengthening) have already spent
that lever. `forms-restyler-change-control` DR-4 step 5 codifies this: "Know
the limits of prompt-only fixes... Further prompt-only attempts at verbatim-
text enforcement are a known-weak path." Any new prompt-only attempt must be
labeled a stopgap in its requirement doc, not treated as *the* fix.

---

## 2. Solution menu (ranked, with obligations)

| # | Solution | Status in this campaign | Obligation before you can claim it works |
|---|---|---|---|
| 1 | **Post-generation validator + bounded retry** (QI-4/QI-6) | **Chosen path — Phases 1–2 below** | Must be unit-testable without API calls, must not silently ship drifted HTML, must not regress Dimension 1/3/4 (Phase 3) |
| 2 | **Auto-correction (DOM string-replace)** instead of a full model retry | Folded into Phase 1 as the "auto-correct fast path" — not a separate phase | Only for pure, unambiguous text drift (the element tagged with a question's `entry` ID has slightly different label text). Must prove the patch can't break surrounding layout/JS — i.e. restrict it to swapping a text node, never restructuring markup. Falls back to the full retry loop for anything structural. |
| 3 | **Deterministic skeleton** (`requirements/future_improvements.md` FI-1: app code builds the DOM with correct `entry.*` names/text/submit JS, Gemini only themes around it) | **Candidate, not scheduled.** Eliminates drift by construction. | Explicitly gated in FI-1's own doc: "Treat as the V-next bet if the QI-4 validator still leaves a meaningful drift/functionality tail in eval results" — i.e. only pursue after Phase 3 shows validator+retry isn't enough. Must prove SI rules 13/14 (layout choice, question-by-question step logic) survive a fixed skeleton — real risk of losing layout creativity. Largest change in this menu; do not start it speculatively. |
| 4 | **LLM-judge automated eval harness** (FI-3) | **Phase 4 below** | Measurement only, not prevention — does not reduce drift by itself. Must be multi-turn (FI-3: "the real product flow is 3+ iterative edits... include at least one multi-edit sequence per eval item"), not single-shot, or it will miss the failure mode this whole campaign is about. |

### Known wrong paths (fenced off — do not spend time here without new evidence)

- **More SI prompt emphasis alone.** Already tried twice (baseline SI +
  `f5599da`); reduced but did not eliminate. Treat as done, not as an open
  option. (`forms-restyler-change-control` DR-4 step 5.)
- **Lowering temperature without measurement.** Checked in this repo,
  2026-07-19: `app/lib/gemini.ts`'s `ai.chats.create({...})` call
  (line ~248) passes only `model`, `systemInstruction`, and `tools` — there
  is **no `generationConfig` block anywhere in the file or in
  `app/app/api/generate/route.ts`**, confirmed by `grep -rn "temperature"
  app/lib/ app/app/api/` returning nothing. So generation runs at whatever
  the Gemini API's unstated default is for this model — an unverified,
  untried knob. It is not fenced off because it's known to fail; it's fenced
  off because **you have no way to tell if it helped** until Phase 0's
  measurement script exists. If you touch it, touch it only as a change
  measured through Phase 0/3's A/B, never as a blind "try lower temperature"
  edit.
- **Hand-eyeballing the 68 published generations.** The failure is
  non-deterministic and, per the qualitative language in INC-9 ("occasionally
  ... infrequent"), plausibly rare (Phase 0's own gate assumes roughly 1–5%).
  A human spot-checking a form once has poor recall against a low base rate —
  most manual passes will see zero drifted forms and wrongly conclude "no
  drift," which is exactly the failure mode Phase 0's own "0% result" gate
  warns about (below). Only a systematic per-question diff catches this
  reliably.

---

## Phase 0 — Baseline measurement

**Goal:** get an actual number for today's drift rate before writing a single
line of validator code. Without this, Phase 3's "after" number has no
"before" to compare against.

### 0.1 What to measure against

There are 68 published generations across 34 eval items (2 image-model
configs each; verified 2026-07-19 by counting `status: "done"` entries under
`generated` in all `evals/manifest-items/*.json` — 37 shard files total, 3
items have zero done generations, matching the "3 Paperform items pending
corrected style guides" state recorded in `requirements/eval_set_creation.md`). Each shard has:

```json
"generated": {
  "gemini-2.5-flash-image": { "status": "done", "url": "https://app-red-phi-88.vercel.app/f/<publishId>", ... },
  "gemini-3.1-flash-image-preview": { "status": "done", "url": "...", ... }
}
```

`GET` that URL and you get the raw generated HTML byte-for-byte — confirmed
live 2026-07-19: `curl https://app-red-phi-88.vercel.app/f/5aYZce4U-t` returns
HTTP 200, the page contains `name="entry.1100682473"` etc., a
`data-gforms-footer` element, the literal string `"First and Last Name"`, and
a `fetch(` call to `api/submit/1FAIpQLSdkD...`. `app/app/f/[id]/route.ts`
serves `record.html` verbatim with `Content-Type: text/html` — no srcdoc
wrapping, no client-side rendering needed, a plain fetch is enough.

**Important — the manifest shard's `structure` field is NOT the ground
truth.** It's the pre-Google-Forms extraction from the *original* competitor
form (Typeform/Paperform/etc.), used only to *create* the eval Google Form,
and it has no `entryId`. The actual `FormStructure` that was fed to Gemini
during generation — the one you must diff against — comes from re-scraping
`form.responderUrl` in the shard, exactly as `evals/tools/generate-restyled.mjs`
does (`scrapeStructure()`, line ~43, `POST /api/scrape` → `scrapeForm()` in
`app/lib/scraper.ts`). `scraper.ts` has zero Next.js-specific coupling (plain
`fetch` + string parsing) — you can import `scrapeForm(url)` directly from a
standalone script instead of running the dev server, or POST to a running
local `/api/scrape` if that's more convenient.

### 0.2 The script

Cross-ref `forms-restyler-analysis-toolkit`, which is expected to ship
`scripts/check-drift.mjs`. If it does not exist yet when you run this
campaign, write it now — this phase specifies its contract:

For each of the 68 generations:
1. `structure = scrapeForm(shard.form.responderUrl)` — ground truth, with
   `entryId`.
2. `html = await (await fetch(generated.url)).text()`.
3. Check, per question:
   - **Text containment**: does `structure.questions[i].text` appear in the
     HTML, accounting for HTML-entity/unicode-escape variants? Reuse the
     exact pattern `evals/tools/lib/verify.mjs`'s `candidates(s)` function
     already established for this exact class of bug (INC-11: Google embeds
     `&`, `<`, `>` as escapes inside JSON-in-script contexts) — build a set of
     candidate encodings (raw, JSON-escaped, `\uXXXX`-escaped, `&amp;`-escaped)
     and check if any appears as a substring after stripping tags/scripts
     from the HTML and normalising whitespace.
   - **Option containment**: same, for every `options[]` string.
   - **Title/description containment**: same, for `structure.title` /
     `structure.description`.
   - **Entry-name presence**: regex `name="(entry\.\d+)"` over the raw HTML
     (do NOT strip tags first) and confirm every `structure.questions[].entryId`
     appears **exactly once**.
4. Emit per-item, per-config: `{ id, config, questionsChecked, textMisses: [...], optionMisses: [...], titleOk, descOk, entryMisses: [...] }`.
5. Roll up: drift rate = (generations with ≥1 miss) / 68, plus a per-question
   miss rate for a finer signal.

**This is a containment scan, not a structural parser.** It cannot tell you
if text A ended up attached to the wrong question's input (a positional/entry
swap) — it only tells you if the expected string is missing from the page
entirely. That's a deliberate, stated limitation: Phase 0 exists to get a
cheap baseline number fast, not to be the production validator. Phase 1
builds the entry-linked, structural version.

### 0.3 The gate

Run it, then reason about the number — do not just report it:

- **Expected: roughly 1–5% of generations show ≥1 miss.** This is an
  **estimate**, not a measured fact — it is inferred from INC-9's qualitative
  language ("non-deterministic and infrequent... a retry usually produces
  correct output") because no one has actually counted it yet. Treat Phase
  0's real output as the first ground truth number this project has ever had
  for this failure mode.
- **If drift rate > 15%:** suspect the *measurement script* before the model.
  In order of likelihood: (a) whitespace/entity normalisation bug — Google's
  `FB_PUBLIC_LOAD_DATA_` and the model's own HTML output can both
  escape/format text differently than your string comparison expects (this
  exact bug already bit `evals/tools/lib/verify.mjs`, see INC-11); (b) you
  stripped tags in a way that merges/splits text incorrectly (e.g. an inline
  `<span>` mid-question breaks a naive substring match); (c) you're comparing
  against the wrong `structure` (the manifest's pre-recreation structure
  instead of the re-scraped one from 0.1). A drift rate that high would be
  wildly inconsistent with every qualitative report on record.
- **If drift rate == 0% across all 68:** your extractor is too lenient —
  false negatives, not a clean model. Verify with a planted-mutation test
  before trusting a 0% result:
  1. Fetch one real generation (e.g. the `atelier-eva-tattoo` config-A URL
     above), save the HTML to a scratch file.
  2. Hand-edit one question's text in the saved copy — e.g. change
     `"First and Last Name"` to `"Full Name"` — leaving everything else
     (including its `entry.1100682473` attribute) untouched.
  3. Run the checker against this mutated file with the real
     `atelier-eva-tattoo` structure. It MUST report a text miss on that
     question. If it doesn't, your containment/normalisation logic has a bug
     (most likely: whitespace collapsing that makes two different strings
     compare equal, or a stale/cached structure).
  4. Only trust a 0% result across the real 68 after this planted-mutation
     check passes.

Record the baseline number (drift rate, per-config breakdown, list of
specific misses) — Phase 3 needs it as the "before" side of the A/B.

---

## Phase 1 — Build the validator (QI-4 / QI-6)

Spec source: `requirements/quality_improvements.md` QI-4 (lines ~120–172) and
QI-6 (lines ~196–208, explicitly "Structural — covered by QI-4": QI-6 is not
a separate module, it's QI-4's checks 4 and 7 called out for Dimension-1
attribution in eval analysis).

### 1.1 Module contract (as specified, verify before deviating)

- New module `app/lib/validate-form.ts` exporting:
  ```ts
  validateGeneratedForm(html: string, structure: FormStructure, submitUrl: string): Violation[]
  ```
  where each `Violation` has a machine-readable code, a human-readable
  message, and expected-vs-found values.
- **Pure function. No network, no API calls, unit-testable in isolation.**
  This is a hard requirement from the spec, not a nice-to-have — Phase 2's
  bounded-retry loop calls this synchronously inside `generateForm()`.

### 1.2 The 9 checks (verbatim from the spec, guard column shows rubric dimension)

| # | Check | Guards |
|---|---|---|
| 1 | Form title and description appear verbatim | Groundedness |
| 2 | Every `questions[].text` appears verbatim | Groundedness (drift) |
| 3 | Every option value for MCQ/checkbox/dropdown appears verbatim | Groundedness |
| 4 | Every `entry.XXXXXXXXX` name attribute present exactly once per question | Functionality (submit routing) — this is QI-6 |
| 5 | Input types match question types (radio/checkbox/`<select>`/etc.) | Groundedness (type swap) |
| 6 | Required flags: required questions validated, optional ones not | Groundedness |
| 7 | A `fetch` POST to `submitUrl` exists in the script | Functionality — this is QI-6 |
| 8 | Footer notices (QI-1) and wordmark (QI-2) present | Groundedness |
| 9 | No question from the structure is missing from the HTML | Groundedness |

### 1.3 Parsing strategy — a real decision point, not a formality

The spec suggests "a lightweight HTML parser (e.g. `node-html-parser`)" for
checks 4/5/6 (attribute/element-structural) and "plain string containment on
decoded text" for checks 1/2/3/9 (verbatim-text). **Verified 2026-07-19:
neither `node-html-parser` nor any HTML/DOM parsing library is currently a
dependency of `app/` (`app/package.json` dependencies list checked — none
present).** Adding one is an explicit sub-step of Phase 1, not an afterthought:
pick a parser, add it to `app/package.json`, and confirm it works inside
Vercel's serverless runtime (the same environment class where
`app/app/api/screenshot/route.ts` already has a documented degraded-fallback
path for a heavier dependency — don't assume every npm package behaves
identically there; a pure-JS HTML parser is far lower risk than a headless
browser, but verify with a live `npm run dev` generation before trusting it
in prod).

For checks 1/2/3/9, reuse Phase 0's containment-with-encoding-candidates
logic (same `candidates()`-style approach as `evals/tools/lib/verify.mjs`) —
Phase 0 and Phase 1 should share this normalisation code rather than
reimplementing it twice; consider extracting it to a small shared helper
(candidate location: `app/lib/` if the validator needs it at runtime, since
`evals/tools/lib/verify.mjs` is Node-tooling-side and not importable from the
Next.js app).

### 1.4 Auto-correct fast path (solution-menu item 2)

Per spec: for pure text drift where the match is unambiguous — the element
carrying a question's `entry` ID has slightly different label text than
`structure.questions[i].text`, with everything else about that element
intact — directly string-replace the drifted text with the verbatim text and
skip a model round-trip entirely. Fall back to the full retry loop (Phase 2)
for anything structural (missing entry, wrong input type, missing footer).

This is cheaper than a retry but has a real failure mode if done carelessly:
a naive `html.replace(oldText, newText)` can corrupt surrounding markup if
`oldText` happens to be a substring of something else in the page (e.g. one
option's label is a substring of the question text, or the same short phrase
appears in both a question and unrelated decorative copy). Constrain the
replace to operate only within the specific DOM element/text node identified
via the entry-ID-linked parse from 1.3, never a blind global string replace
across the whole HTML document.

### 1.5 Testing — repo has no test framework

Confirmed 2026-07-19: `app/package.json` scripts are `dev`, `build`, `start`,
`lint` only — no `test` script, no `.github/workflows`
(`forms-restyler-architecture-contract` §4, "No automated tests, no CI").
Validation here follows repo convention (`app/test_redis.mjs`,
`app/test_persistence.mjs`): an ad-hoc Node script, not a Jest/Vitest suite,
unless you deliberately decide to introduce one (that decision itself is
scope creep worth flagging to the owner, not a silent addition).

At minimum, write fixtures and assert against them:
- **Known-bad fixtures**: drifted question text (use Phase 0.3's planted-
  mutation technique), a missing `entry.*`, a swapped input type (checkbox
  rendered as radio), missing footer notices. Assert each produces the
  correct violation code.
- **Known-good fixture**: one of the 68 real published generations that
  Phase 0 confirmed has zero misses. Assert zero violations.

### 1.6 Gate

- Validator flags every planted mutation from 1.5 with the correct check
  number/code.
- Validator returns `[]` on the known-good fixture.
- `cd app && npx tsc --noEmit && npm run lint` clean (per
  `forms-restyler-change-control` §1 class-(b) gate — this module alone,
  not yet wired in, is class (b): new library code, no prompt text).

Do not proceed to Phase 2 until both fixture classes pass. A validator that
misses planted mutations will silently rubber-stamp real drift once wired in.

---

## Phase 2 — Wire into generation

### 2.1 Where

`app/lib/gemini.ts`, `generateForm()`, after the final HTML is extracted
(currently ends around line ~517: `const html = text.replace(...).trim();`)
and before the function returns. `submitUrl` is already a parameter to
`generateForm()` (threaded in from `app/app/api/generate/route.ts` line ~61)
— the validator's third argument is already available, no new plumbing
needed there.

### 2.2 The retry loop (per spec)

1. Run `validateGeneratedForm(html, structure, submitUrl)`. Clean → done.
2. On violations: send a corrective follow-up message in the **same** chat
   session (`chat.sendMessage([...])` — the `chat` object from
   `ai.chats.create()` is already in scope in `generateForm()`) listing each
   violation precisely — spec's example phrasing: `"Question 3 text must be
   exactly: '…' but you rendered: '…'"` — and ask for the complete corrected
   HTML. Re-validate the new response.
3. **Cap at 2 retries.** If violations persist after 2 corrective rounds,
   return the HTML anyway, with the violations attached to the result, so
   the UI can show a warning. **Never hard-fail a generation the creator
   could still accept** — this is explicit in the spec and matches the
   product's existing posture toward image-generation failures
   (`imageErrors` is already a non-fatal, surfaced-to-UI field on the same
   return type).
4. Auto-correct fast path (1.4) runs first, before the retry loop, for any
   violation it can resolve unambiguously — only unresolved violations go to
   the model round-trip.

This means `generateForm()`'s return type gains a field (e.g.
`violations: Violation[]`), and `app/app/api/generate/route.ts`'s `result`
SSE event needs to carry it through to the client, alongside the existing
`html`, `generatedImages`, `imageErrors`.

### 2.3 SSE contract — a concrete trap, not a formality

`forms-restyler-architecture-contract` invariant (i): the SSE step
vocabulary is a **closed, hardcoded set** that `app/components/ChatPanel.tsx`
switches on by literal string. Adding a `validate` step without touching the
frontend will silently do nothing — no error, the step just never renders.
Confirmed 2026-07-19, two places in `ChatPanel.tsx` need a matching edit:
- `stepLabelMap` (line ~43): add `validate: "Validating form..."` (or
  similar) alongside the existing `analyze`/`image_gen`/`color_match`/`html_gen`
  entries.
- The initial `steps` array construction (lines ~53–62, where `steps.push({
  step: "html_gen", ... })` currently sits last): push a new `validate`
  step entry after `html_gen`, since validation runs after HTML generation
  completes.

Emit from `gemini.ts`/route.ts, matching the existing `onProgress?.({...})`
pattern used for every other step: `validate/started` before the check runs,
`validate/completed` (with a `detail` summarising what was fixed/retried, if
anything) on success, `validate/failed` if violations persisted past the
retry cap.

### 2.4 Change classification — read this before writing the diff

`forms-restyler-change-control` §1 note: "if a diff touches both prompt text
and logic, treat the whole change as class (a)." **The Phase 2 corrective
retry message (2.2 step 2) is prompt content** — it's text sent to the model
inside `gemini.ts`, right alongside the SI — even though most of this phase's
diff is structural (retry loop, SSE plumbing, ChatPanel labels). Classify the
**entire** Phase 2 diff as **class (a) SI/prompt**, not class (b). That means
it needs the full SI change protocol (`forms-restyler-change-control` §4):
a written requirement (QI-4 already exists — update its status table, don't
write a new doc), one batched revision, live dev-server verification, and an
eval A/B before merge — not just `tsc`/`lint`.

### 2.5 Latency — measure it, don't guess

Retries add real latency (an extra `chat.sendMessage()` round-trip per
retry, up to 2). The manifest shards already record `durationMs` per
generation (see the `atelier-eva-tattoo` example: `"durationMs": 121410`).
Reuse that field in Phase 3's re-run to compare mean/tail latency
before-validator vs after-validator — don't ship this phase on the assumption
that retries are "probably fine" latency-wise; the eval set gives you the
exact instrument to check.

### 2.6 Gate

- Live `npm run dev` generation against a real test form: happy path (no
  violations) completes with no behavior change visible to the creator
  except the new "Validating..." timeline step.
- A planted-mutation fixture run through the real `/api/generate` flow (not
  just the unit-level validator) triggers a retry and either self-corrects
  or surfaces a violation-count warning — confirm the SSE `validate` events
  actually reach and render in `ChatPanel.tsx`.
- `npx tsc --noEmit` + `npm run lint` clean.

---

## Phase 3 — Eval A/B re-run + rating pass

Purpose: confirm the validator actually reduces drift **and** doesn't
regress the other three rubric dimensions (a validator could, in principle,
push the model toward "verbatim but ugly/degenerate" layouts to dodge
retries — this phase is what would catch that).

### 3.1 Procedure

Follows the standard SI change protocol
(`forms-restyler-change-control` §4) exactly, since 2.4 classified this as
class (a):

1. **Version-of-truth (DR-1):** confirm you're generating against the LOCAL
   dev server running the working tree with Phase 1/2 code, not prod (prod =
   `main`, which has none of this).
2. **Pilot first (DR-7):** `cd evals/tools && node generate-restyled.mjs
   --only=<one-item-id>` — pick one item, eyeball the result, confirm the
   validator step appears in the timeline and behaves.
3. **Full re-run:** `node generate-restyled.mjs --all` (or `--retry-failed`
   to resume). This publishes new generations to prod's Redis/Blob (68 new
   public URLs with 1-year persistence) — **this requires owner sign-off**
   per `forms-restyler-change-control` §5 ("Anything spending meaningful paid
   API quota in batch," "Writes to the shared Redis/Blob store beyond normal
   single-form dev testing").
4. **Drift comparison:** run Phase 0's `check-drift.mjs` (or its eventual
   home in `forms-restyler-analysis-toolkit`) against the new 68 generations.
   Compare against the Phase 0 baseline number.
5. **Rating pass:** run the human rating pass per `evals/rater_instructions.md`
   on (at minimum) every item where Phase 0 or this re-run showed drift, to
   confirm Dimension 1 (Functionality), 3 (Completeness), 4 (Aesthetics)
   didn't regress. Cross-ref `forms-restyler-validation-and-qa` for rating
   mechanics.

### 3.2 Success criteria (numbers, not vibes)

- **0 uncorrected drift** across the full 68-generation re-run — meaning
  every generation is either (a) drift-free per `check-drift.mjs`, or (b) had
  drift that the auto-correct fast path or retry loop resolved before
  returning, or (c) still has violations after 2 retries but they are
  **surfaced as a UI warning**, never silently shipped. "0 uncorrected" is
  about silence, not about the retry loop achieving literal perfection on
  the first pass.
- **Rubric Dimension 1/3/4 deltas within noise.** There is no formal
  statistical test defined for this eval set (it's 34 items rated by
  probably one rater against `rater_instructions.md`'s categorical scale) —
  define "within noise" pragmatically: no item that previously rated "No
  Issues" or "Minor Issue(s)" on Dimensions 1/3/4 drops to "Major Issue(s)"
  or "Critical Failure" after this change, and the overall A-vs-B comparison
  scale (`rater_instructions.md` "Final overall comparison", 1–7) doesn't
  shift the aggregate verdict against the validator. This is a judgment call
  — say so explicitly in the write-up rather than presenting a threshold that
  doesn't actually exist in the tooling.
- **Latency:** report the mean/p90 `durationMs` delta from 2.5's instrument.
  Not a pass/fail gate by itself (the spec explicitly prioritizes never
  silently shipping drift over speed), but must be reported so the owner can
  judge the trade-off, and it should inform the UI copy for the "Validating"
  step (creators should not think generation hung).

Only after this gate passes does Phase 3's diff (which is really the same
diff as Phase 2, now validated) go through §4's promotion protocol.

---

## Phase 4 — Automate measurement (LLM-judge, FI-3)

This is the second half of the owner's stated goal — "independently
validated with evals automatically," i.e. without a human running the rating
pass by hand every time the SI changes. Spec source:
`requirements/future_improvements.md` FI-3.

**Sequencing note:** FI-3 is ranked #1 in `future_improvements.md`'s own
"Suggested sequencing" table ("De-risks everything else"), but it is Phase 4
*in this campaign* specifically because FI-3's own harness design calls the
QI-4 validator as step 3 of its pipeline — it has nothing to call until
Phases 1–2 exist. Outside this specific drift campaign, building the harness
sooner is reasonable; here, it's sequenced last because it's a consumer of
what Phases 1–2 produce.

### 4.1 What FI-3 specifies

Per eval-set item: (1) run form + prompt (+ style guide) through
`/api/generate`, (2) screenshot the result at desktop and mobile widths, (3)
run the QI-4 validator (Phase 1's module) for deterministic
groundedness/functionality checks, (4) have a judge model score the output
against `evals/rater_instructions.md`'s four dimensions, producing
per-dimension ratings + failure-mode flags.

**Multi-turn is explicit and easy to skip accidentally:** FI-3's own doc
flags this — "the real product flow is 3+ iterative edits; drift and quality
decay across edits is a distinct failure mode that a single-shot eval never
exercises. Include at least one multi-edit sequence per eval item." A
harness that only exercises first-shot generation will systematically miss
drift introduced by iterative editing (`previousHtml` + follow-up prompt path
in `generateForm()`), which is a real, distinct code path from first
generation.

### 4.2 Status and labeling

**Label this a candidate, not a delivered fix.** No LLM-judge harness exists
in this repo as of 2026-07-19 — this phase is a design spec, not a built
thing. Building it is its own class-(c) (eval tooling) or class-(b) effort
under `forms-restyler-change-control` depending on where it lives
(`evals/tools/` vs elsewhere), and it needs its own validation: before
trusting the judge model's ratings as a substitute for human rating, run it
alongside a real human rating pass on the same items and confirm the judge's
verdicts correlate — an unvalidated judge model is not "independently
validated," it's just a second unverified opinion.

---

## Validation-and-promotion protocol

From "validator works locally" to merged-to-main, in order:

1. Phase 1 gate passed (fixtures) — local, no network, cheap.
2. Phase 2 gate passed (live dev-server smoke test with a planted mutation,
   SSE events actually render).
3. `cd app && npx tsc --noEmit && npm run lint` clean.
4. **Owner sign-off requested** for Phase 3's batch run (quota spend + 68
   new public prod URLs) — per `forms-restyler-change-control` §5, no agent
   inference substitutes for this.
5. Phase 3 pilot (1 item), eyeball, then full 34-item/68-generation re-run.
6. Phase 3 success criteria met (§3.2 above) — 0 uncorrected drift, Dim
   1/3/4 within noise, latency reported.
7. Update `requirements/quality_improvements.md`'s status table: QI-4 and
   QI-6 rows move from "⬜ Not started" to "✅ Implemented," dated, with a
   one-line pointer to the eval numbers (per DR-10, "status tables carry
   dates" — follow the existing "(2026-07-18)" table header as the model).
8. Update `documentation/architecture.md`'s "Known limitation — rare
   question text drift" section (line ~229): either remove it if Phase 3
   showed 0 uncorrected drift with no caveats, or rewrite it to state the
   residual rate and the mitigation (retry + UI warning), never leave it
   describing a pre-validator state after the validator ships.
9. Commit as one batched revision (per DR-4 step 2 and the branch protocol
   in `forms-restyler-change-control` §3) — check whether `si-improvements`
   is still open (`git log main..si-improvements --oneline`) and whether
   this lands as further commits there or its own branch; either way, PR to
   `main`, never a direct commit.
10. **Explicit owner sign-off before merge** — `main == prod` (DR-5), a merge
    here is a deploy of new SI-adjacent behavior to the public URL.

Do not skip steps 4 or 10 because "the code looks right" — both DR-5 and §5
of `forms-restyler-change-control` are unconditional on this repo, and this
campaign's whole premise is replacing "looks right" with a number.

---

## Provenance and maintenance

Written 2026-07-19 against branch `si-improvements`. Every path, line
number, and behavior claim above was verified directly, not assumed:

- `requirements/quality_improvements.md` (QI-4 full text, lines ~120–172;
  QI-6, lines ~196–208; status table, lines ~24–38) and
  `requirements/future_improvements.md` (FI-1, FI-3, sequencing table) —
  read in full.
- `app/lib/gemini.ts` — read in full (533 lines): `MODEL_ID`, `buildSystemPrompt`
  rules 1/6/7/13/14/18, `buildGoogleFormsFooter`, `generateForm()` structure,
  confirmed no `generationConfig`/`temperature` anywhere (`grep -rn
  "temperature" app/lib/ app/app/api/` → no hits).
- `app/lib/scraper.ts` — read in full: `FormStructure`/`FormQuestion` shape,
  confirmed framework-independent (`scrapeForm(url)` is plain `fetch` +
  string parsing).
- `app/app/api/generate/route.ts` — read in full: `submitUrl` construction
  (line ~61), SSE event shapes, `generateForm()` call signature.
- `app/app/f/[id]/route.ts` — read in full: confirms published HTML is
  served raw, no srcdoc wrapper, enabling a plain `fetch` in the measurement
  script.
- `app/app/api/scrape/route.ts` — read in full: confirmed it's a thin
  wrapper around `scraper.ts`'s `scrapeForm`.
- `evals/tools/generate-restyled.mjs` — grepped for `scrapeStructure`,
  confirmed it re-scrapes `item.form.responderUrl` via `/api/scrape` rather
  than using the manifest's `structure` field.
- `evals/tools/lib/verify.mjs` — read in full: the `candidates()` encoding-
  variant pattern (INC-11) that Phase 0/1 are told to reuse.
- `evals/manifest-items/atelier-eva-tattoo.json` — read in full as a concrete
  example (11 questions, 2 done generations, real `durationMs` field).
- Live verification, 2026-07-19: `curl
  https://app-red-phi-88.vercel.app/f/5aYZce4U-t` → HTTP 200, 28233 bytes,
  confirmed `entry.*` names, `data-gforms-footer`, verbatim question text,
  and the submit `fetch(...)`/`api/submit/...` call all present in the raw
  response.
- 68-generation / 34-item / 37-shard count — computed directly by iterating
  every `evals/manifest-items/*.json` and counting `generated[*].status ===
  "done"` entries (script run 2026-07-19; not taken
  on faith from prior session notes).
- `app/package.json` — read in full: confirmed no `test` script, no
  `node-html-parser`/`cheerio`/HTML-parser dependency currently present.
- `documentation/architecture.md` line ~229 — the exact "Known limitation"
  wording quoted in §1.
- `app/components/ChatPanel.tsx` — grepped for `stepLabelMap` and the
  initial `steps` array construction to ground the Phase 2.3 SSE-wiring
  claim in real line locations.
- `forms-restyler-architecture-contract` and `forms-restyler-change-control`
  skills — read in full for invariants (a)/(b)/(i), the change taxonomy, and
  DR-1 through DR-12; cross-referenced rather than restated in full here.

**Not independently verified (flagged, not asserted as fact):** the actual
Gemini API default temperature value for `gemini-3-flash-preview` (out of
scope — would require Gemini API documentation, not this repo); whether
`si-improvements` is still open/unmerged at the time you run this campaign
(re-check with `git log main..si-improvements --oneline` — it was 6 commits
ahead and unmerged as of the write-up date, per the change-control skill,
but that is a volatile fact).

Re-verify quickly before trusting stale numbers:
- `grep -n "QI-4\|QI-6" requirements/quality_improvements.md` — still "Not
  started"?
- `python3 -c "import json,glob;print(sum(1 for f in glob.glob('evals/manifest-items/*.json') for v in json.load(open(f)).get('generated',{}).values() if v.get('status')=='done'))"` —
  still 68?
- `grep -rn "temperature" app/lib/ app/app/api/` — still no hits?
- `ls app/node_modules | grep -i "html-parser\|cheerio"` — still absent?
- `grep -n "validate" app/components/ChatPanel.tsx` — has someone already
  started this work?
