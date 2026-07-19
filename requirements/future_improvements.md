# Forms AI Restyler — Future Quality Improvements

## Overview

These improvements go beyond the rubric-driven fixes in `quality_improvements.md`
(QI-1 … QI-11). They address quality at the pipeline/architecture level rather than
patching the system instructions (SI). Ordered roughly by leverage. None are scheduled.

Status 2026-07-19: the QI-4 validator has landed (drift 7.4% → 0 uncorrected) and the
first human rating pass is analyzed in `post_eval_quality_improvements.md` — its
prioritized fixes (themes T1–T8) come before this list. FI-1..FI-7 predate that
analysis; FI-8..FI-14 were added after it and are written with implementation-level
detail for independent execution.

---

## FI-1: Deterministic form skeleton (generate theme, not structure)

**Problem:** Gemini writes *everything*, so every generation re-risks question text,
entry IDs, and submit wiring. The QI-4 validator catches violations after the fact, but
prevention beats detection.

**Idea:** Have application code deterministically build the form skeleton — inputs with
correct `entry.` names, types, required flags, verbatim question text, submit JS, footer
notices, and logo — and constrain Gemini to producing the theme around it: CSS, layout
wrappers, step logic, decorative HTML. Entire rubric failure classes (text drift, type
swaps, broken submit) become impossible by construction.

**Trade-offs:**
- Significant refactor of the generation contract (Gemini's output format changes from
  "complete HTML page" to "theme + layout around a fixed skeleton").
- Trades away some layout freedom — radical layouts (e.g. fully custom step components)
  are harder when the input markup is fixed. Mitigable by letting Gemini emit wrapper
  structure around skeleton fragments rather than a single fixed DOM.

**When to do it:** Treat as the V-next bet if the QI-4 validator still leaves a meaningful
drift/functionality tail in eval results.

---

## FI-2: Vision self-review pass ("render, look, fix")

**Problem:** No static validator can catch visual failures — bad contrast over gradients,
overlapping text, clipped content, broken mobile scaling, irrelevant imagery. These are
exactly rubric Dimension 4.

**Idea:** After HTML generation, render the form headlessly at desktop *and* mobile
viewport widths (screenshot infrastructure already exists for the style-guide feature),
feed the screenshots back to Gemini as vision input with a critique checklist derived
from rubric Dimension 4 (contrast, overflow, clipping, clashing colours, image
relevance, scaling), and let it emit one corrected pass.

**Trade-offs:** One extra model round-trip plus two renders per generation — meaningful
latency. Options: a "high quality" toggle in the UI, or run only on first generation
(not on iterative edits).

**Pairs with:** FI-6 (the same headless render can host the runtime smoke test).

---

## FI-3: Automated eval harness with LLM-as-judge

**Problem:** SI tuning without cheap regression signal is guesswork; manual rating
sessions are too slow to iterate against.

**Idea:** A script that, for each eval-set item:
1. Runs the form + prompt (+ style guide) through `/api/generate`
2. Screenshots the result at desktop and mobile widths
3. Runs the QI-4 validator for deterministic groundedness/functionality checks
4. Has a judge model score each output against the rubric dimensions
   (`rater_instructions.md`), producing per-dimension ratings + failure-mode flags

Manual eyeballing remains the final call on visual appeal, but regression signal per SI
change drops from a rating session to minutes.

**Detailed spec now exists (2026-07-19):** see `post_eval_quality_improvements.md`,
"Item 5 — LLM auto-judge" — two modes (comprehensive Sonnet-on-subscription /
regression Haiku-on-Batch-API), budget guardrails, output schema, and calibration
gates against the 15 human-rated rows. Implement from that spec, not from this sketch.

**Important:** Eval **multi-turn**, not just single-shot. The real product flow is 3+
iterative edits; drift and quality decay across edits is a distinct failure mode that a
single-shot eval never exercises. Include at least one multi-edit sequence per eval item.

---

## FI-4: Typography — allow Google Fonts

**Problem:** The SI's "no external stylesheets" rule forces system fonts, capping the
typography quality that rubric Dimension 4 explicitly rates.

**Idea:** A single carve-out: allow `<link>` imports from `fonts.googleapis.com` /
`fonts.gstatic.com`, nothing else. Published forms are served without a restrictive CSP,
so the fonts load fine at `/f/{id}`.

**Effort/risk:** One SI rule change; low risk. Probably the cheapest visual-appeal win
available. Verify the eval set renders before/after (fonts must not break the sandboxed
`srcdoc` preview either).

---

## FI-5: Scrape more of the original form

**Problem:** Groundedness is judged against the *original form*, and the scraper drops
content the original may have: per-question descriptions, images attached to questions,
section/page breaks (normalised away), and possibly linear-scale endpoint label edge
cases. If any eval-set form uses these, groundedness hits are baked in before Gemini
ever runs — no SI change can fix them.

**Idea:** Audit `FB_PUBLIC_LOAD_DATA_` for:
- Question descriptions (typically `q[2]`) — carry into `FormStructure` and require
  verbatim rendering (extend QI-4 validator check 2 to cover them)
- Section/page structure — expose to the model so multi-section forms can be honoured
- Question-attached images — at minimum flag their existence; ideally pass URLs through

**First step:** Check the eval-set forms for these features to size the actual impact.

---

## FI-6: Runtime smoke test of generated JS

**Problem:** The QI-4 validator checks statically; it cannot catch a JS runtime error
that blanks the page — the rubric's "Critical Failure" tier.

**Idea:** Headless-load the generated HTML and assert: zero console errors, the form
element exists, and (optionally) a scripted fill-and-submit against a mocked fetch
resolves. Catches catastrophic failures before the creator ever sees them.

**Pairs with:** FI-2 — the same headless render session can produce the screenshots and
run this check in one pass.

**Superseded in part (2026-07-19):** `post_eval_quality_improvements.md` "Item 2 —
interaction harness" specifies a fuller version (answer every question, walk steps,
intercept the submit POST) with serving-integration options and a decision rule.
Implement the harness from that spec; this FI's "zero console errors + form exists"
assertions should be folded into it as its cheapest checks.

---

## FI-7: Multi-image style coherence

**Problem:** When Gemini generates multiple images (e.g. header + background), nothing
ties their styles together beyond luck. Rubric checks "style cohesion" and "images not
related to form or prompt".

**Idea:** Have the first `generate_image` call establish a style descriptor (palette +
rendering style, e.g. "flat vector illustration, dusty pastel palette") that
`image-gen.ts` appends to every subsequent image prompt in the same generation. Could be
an extra parameter on the `generate_image` function declaration that the model fills
once and the pipeline then enforces.

---

## FI-8: Structured style-guide analysis step

**Problem:** The model reads the style-guide image fresh inside each generation call,
and its reading varies run to run — the two image configs even disagree on *which*
eval items get images at all. Themes T7 (layout ignored) and T8 (off-brand imagery)
in `post_eval_quality_improvements.md` are both symptoms: "match the vibe" is not
enforceable; "use these hex values" is.

**Design:** A dedicated extraction pass that turns the style guide into structured
facts consumed by everything downstream.

1. New module `app/lib/style-facts.ts`: `extractStyleFacts(styleGuideImage) →
   { palette: string[] /* hex, dominant first */, typographyFeel: string,
   moodKeywords: string[], layout: { heroPlacement, coverStyle, columns, type } }`.
   Implementation: one small Gemini vision call with a JSON-schema response —
   temperature 0, no generation context, just the image. (Read `app/lib/gemini.ts`
   first: an SSE step `color_match` already exists in the flow — understand what it
   does and either subsume it or feed it, do not duplicate it.)
2. Inject the result into the html_gen prompt as a `STYLE FACTS` block, and into the
   `generate_image` prompts (this implements the item-4 image-fit fix). The `layout`
   object is the same shape as item 3's `announce_plan` extension — reuse one type.
3. Emit it as an SSE step so the ChatPanel timeline shows "Analyzing style guide…".
4. Caching: keyed by a hash of the image bytes. Start with **no cache** (correctness
   first); if added later it is a prod Redis write — DR-2 applies, use a TTL and a
   distinct key prefix (`stylefacts:`).

**Verification:** For the eval set's style guides, extracted palettes can be checked
against the images programmatically (dominant-color extraction with any pixel
library); layout facts are checked by the item-5 judge. Success metric: reduced
run-to-run variance (FI-11 measures it) and fewer T7/T8 flags.

**Trade-offs:** One extra small model call (~2–4s, ~1–2k tokens) per generation with
a style guide. Latency cost is tiny next to the 85s p50; consistency gain is the
point.

---

## FI-9: Cheap surgical retries (patch-based correction)

**Problem:** Every corrective retry — QI-4 today, the interaction harness later — is
a full Gemini round-trip regenerating the entire HTML document: +30–60s and a fresh
chance for the model to change things that were fine. Most corrections are tiny
(restore one verbatim string, add one attribute).

**Design:**

1. Add a patch variant to `app/lib/validate-form.ts`'s correction path:
   `buildPatchPrompt(violations)` asks the model to return ONLY a JSON array of
   `{ "search": "<exact substring from the current HTML>", "replace": "<fixed
   substring>" }` objects — no full document.
2. In `gemini.ts`'s retry loop: apply patches with plain `String.replace` (each
   `search` must occur exactly once — if not found or ambiguous, the patch fails).
3. Re-run `validateGeneratedForm` on the patched HTML. If violations remain or any
   patch failed to apply, fall back to the existing full-regeneration retry —
   the patch path is an optimization, never the only path.
4. Order of attempts: patch (fast) → full regen (slow) → give up with warnings, and
   the retry counter covers both kinds.

**Verification:** Offline test in the style of the existing validator tests: take a
saved eval HTML, plant a known drift (mutate one question string), run the loop
against a mocked model that returns the correct patch, assert the result validates
clean. Then measure retry latency before/after on the items that actually retried
in the 2026-07-19 campaign (barrys, katto, wa-green-energy).

**Trade-offs:** Patches can fail on models that paraphrase the `search` text —
hence the mandatory fallback. Expected win: retry cost drops from 30–60s to
~5–10s for the common single-string case, which matters more as more validators
gate generation.

---

## FI-10: Branching forms — support or detect-and-disclose

**Problem:** Google Forms supports section-based conditional navigation ("go to
section based on answer"). The scraper flattens everything into one linear question
list, so a branched original silently becomes a linear form: respondents see
questions from branches that should never apply to them. Wiring is technically
correct, semantics are wrong — and no current check can notice.

**Design (two stages — do stage 1 regardless):**

1. **Detect and disclose.** In `app/lib/scraper.ts`, while parsing
   `FB_PUBLIC_LOAD_DATA_`, detect section breaks and navigation rules (sections are
   their own item type in the payload; choice options carry an optional
   go-to-section action — verify the exact indices against a hand-made branched
   test form before trusting any of this). Add `hasBranching: boolean` to
   `FormStructure`. When true: show a notice in the UI ("this form uses conditional
   sections; the restyled version shows all questions to everyone") and record it
   in the generation result. This is small and honest.
2. **Support (bigger, decide later).** Pass section structure + navigation rules to
   the model and require generated multi-step forms to implement the branching in
   JS. Needs: SI rules for branch logic, interaction-harness support for walking
   branches (answer to force each path), and eval items with branched originals
   (the current 37 have none — check first with a scan of the manifest's raw
   payloads; if none, stage 2 has no test bed and must wait for eval expansion).

**First step:** Create one branched Google Form by hand, scrape it, and dump the
payload to confirm where sections/navigation live. Size stage 2 only after that.

---

## FI-11: Run-to-run variance measurement

**Problem:** Every eval conclusion so far rests on N=1 per (item × config). If
generation variance is high, an "SI v2 beats SI v1" comparison or an A-vs-B config
verdict may be noise. This is cheap to measure and protects every future tuning
decision.

**Design:** Script `evals/tools/variance-run.mjs` (house CLI conventions:
fail-closed args, resumable `--report=`):

1. Pick ~5 diverse items (suggested: one long multi-step, one short single-page,
   one with a strong style guide, one zero-image-prone, one retry-prone — e.g.
   barrys-lead-gen, tally-feature-request, atelier-eva-tattoo, katto-product-rec,
   wwf-cities-feedback).
2. Generate each **3×** with identical inputs on one config via the local pipeline
   (reuse the generation driver pattern from the validator campaign).
3. Metrics per item across the 3 runs: validator retries, imageCount, durationMs,
   judge flags + scores (once item-5 exists), HTML size. Report per-item spread and
   a summary: "flag agreement rate across reruns", "score std dev".
4. Interpretation rule to write into the report: any future A-vs-B difference
   smaller than the measured rerun spread is noise — do not act on it.

**Cost:** 15 generations ≈ 25 minutes wall-clock and zero new infrastructure.
Rerun after any change claimed to "reduce variance" (e.g. FI-8).

---

## FI-12: Production telemetry as a continuous quality signal

**Problem:** The app already computes rich quality data on every prod generation
(validator violations, retries, duration, config, image count) and then throws it
away. Offline evals are the only quality signal, and they can't see real usage.

**Design:**

1. **Explicit metrics.** At the end of `generateForm` (or in the `/api/generate`
   route where the result is already assembled), write one compact JSON record:
   `{ ts, formIdHash, config, durationMs, retries, violationCodes, imageCount,
   htmlBytes }`. **No form content, no question text, no user text** — metadata
   only (privacy line; also keeps records small).
2. **Storage:** this is a prod write — DR-2 says design it deliberately. Simplest
   robust option: Redis `LPUSH telemetry:generations` + `LTRIM` to a capped length
   (e.g. 5,000 records) so it can never grow unbounded. Alternative: structured
   `console.log` and rely on Vercel log drains — zero storage risk, weaker
   querying. Start with the capped Redis list.
3. **Implicit signals (second stage):** log regenerate-after-viewing (the same
   session re-submitting a prompt for the same form = implicit thumbs-down) and
   `/f/{id}` first-view (the share actually got used). Requires only route-level
   counters, same storage pattern.
4. **Reading it:** a small script `evals/tools/telemetry-report.mjs` that pulls the
   list and prints rates (retry rate, violation-code frequencies, p50/p90 duration
   per config) — the prod counterpart of the eval reports, comparable numbers.

**Trade-offs:** One Redis write per generation (~negligible). The value compounds:
after any deploy, the retry/violation rates say whether prod matches eval behavior.

---

## FI-13: Injection hardening of verbatim content

**Problem:** DR-3 makes original form text sacred and the pipeline copies it
verbatim into generated HTML. If a scraped form's title/question/option text
contains HTML (`<img onerror=…>`, `<script>`), a naive verbatim copy renders it as
*markup* — an XSS vector on published `/f/{id}` pages. "Verbatim" must mean
verbatim **text**, not verbatim markup.

**Design:**

1. **Validator check (detection):** new check in `app/lib/validate-form.ts` — for
   every structure string containing `<`, `>`, or `&`, assert the generated HTML
   contains the *escaped* form (`&lt;` etc.) in its visible corpus and does NOT
   contain the raw string in a position where it parses as a tag. New violation
   code `unescaped_content`, severity error (it's a security bug, not a style bug).
2. **SI rule (prevention):** one line — "When copying structure text into HTML,
   HTML-escape it (`<` → `&lt;`, `&` → `&amp;`); the text must render as visible
   characters, never as markup."
3. **Test fixture:** add a self-test case with a planted structure containing
   `Question <img src=x onerror=alert(1)> text` and assert the validator flags a
   generation that renders it raw and passes one that escapes it. Do NOT add such
   a form to the shared eval set (DR-2: eval forms are real prod Google Forms —
   keep the fixture offline).

**Effort:** Small — a day including tests. Worth doing before any public promotion
of the app.

---

## FI-14: Accessibility and page-weight budgets

**Problem:** No rater mentioned accessibility and nothing measures load performance,
but both are real quality: forms are meant to be filled by arbitrary respondents on
arbitrary devices. Both are cheap to check mechanically once the item-2 harness
exists.

**Design:**

1. **SI rules (one new rule, keyboard + labels):** every input reachable and
   operable by keyboard alone; visible `:focus-visible` styling consistent with the
   theme; every input associated with its question text via `<label for>` or
   `aria-label`; custom controls (styled radios/checkboxes) must keep the native
   input focusable, not `display:none` it away (use `opacity:0` +
   positioning instead, which preserves keyboard and screen-reader behavior).
2. **Harness extension (keyboard pass):** after the mouse-driven pass, reload and
   repeat answering using only `page.keyboard` (Tab to each control, Space/Arrow
   keys to select, type into text fields). Assert every question answerable and
   focus visibly moves (computed style changes on focus). New violation codes:
   `keyboard_unreachable`, `focus_invisible`, `label_missing` (the last is a
   static DOM check, no interaction needed).
3. **Page-weight budget (static script, can live in check-drift or standalone):**
   HTML ≤ ~400 KB; total referenced image bytes ≤ ~1.5 MB (fetch HEAD of each
   blob URL); no external requests other than the allowed hosts (blob store for
   images; plus Google Fonts if FI-4 lands). Budget numbers are starting points —
   set them from the current eval set's actual distribution (measure first, then
   set the budget just above the healthy range).

**Sequencing note:** the label check and page-weight script need no harness and can
ship independently; the keyboard pass rides on item-2.

---

## Suggested sequencing

The near-term order for the post-eval fixes (SI rule pack, interaction harness,
layout extraction, judge) lives in `post_eval_quality_improvements.md` — that
sequence comes first. Among the remaining FIs:

| Order | Item | Why |
|---|---|---|
| 1 | FI-3 (eval harness / judge) | De-risks everything else; implement from the post-eval doc's item-5 spec |
| 2 | FI-11 (variance measurement) | 25 minutes of compute that protects every future tuning decision from noise |
| 3 | FI-13 (injection hardening) | Small, and a security bug — do before promoting the app |
| 4 | FI-4 (Google Fonts) | Trivial effort, immediate aesthetics gain |
| 5 | FI-8 (structured style facts) | Cuts variance at the source; implements parts of post-eval items 3–4 |
| 6 | FI-2 (vision self-review) | Only lever that touches visual quality end-to-end |
| 7 | FI-9 (surgical retries) | Value grows as more validators gate generation |
| 8 | FI-12 (prod telemetry) | Compounds over time; needs deliberate DR-2 design |
| 9 | FI-5 (scraper depth) + FI-10 stage 1 (branching detection) | Same code area (scraper/payload audit); size together |
| 10 | FI-14 (a11y + page weight) | Label/weight checks anytime; keyboard pass after the harness exists |
| 11 | FI-6 (runtime smoke test) | Folded into the interaction harness (see note above) |
| 12 | FI-7 (image coherence) | Scoped to image-enabled generations; partly covered by FI-8's style facts |
| 13 | FI-1 (deterministic skeleton) | Biggest refactor; decide after harness + judge data says how big the remaining tail is |
