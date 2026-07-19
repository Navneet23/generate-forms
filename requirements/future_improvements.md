# Forms AI Restyler — Future Quality Improvements

## Overview

These improvements go beyond the rubric-driven fixes in `quality_improvements.md`
(QI-1 … QI-11). They address quality at the pipeline/architecture level rather than
patching the system instructions (SI). Ordered roughly by leverage. None are scheduled
yet — they are candidates for prioritisation after the batched SI revision and the
QI-4 validator land and the first eval run establishes a baseline.

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

## Suggested sequencing

| Order | Item | Why first |
|---|---|---|
| 1 | FI-3 (eval harness) | De-risks everything else; makes all other bets measurable |
| 2 | FI-2 (vision self-review) | Only lever that touches visual quality end-to-end |
| 3 | FI-4 (Google Fonts) | Trivial effort, immediate aesthetics gain |
| 4 | FI-5 (scraper depth) | Sized by checking the eval set; may be urgent if forms use sections/descriptions |
| 5 | FI-6 (runtime smoke test) | Cheap once FI-2's headless render exists |
| 6 | FI-7 (image coherence) | Scoped to image-enabled generations |
| 7 | FI-1 (deterministic skeleton) | Biggest refactor; decide after validator eval data |
