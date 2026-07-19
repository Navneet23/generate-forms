# Post-Eval Quality Improvements — Human Rating Analysis

Status: **Analysis written 2026-07-19. Fixes proposed, none implemented.**

## Context

- Source: the owner's human eval pass over the 37-item eval set (Google Doc
  "Forms Restyler — Eval Set", generated 2026-07-18). Each rated row has
  feedback for config **A = Gemini 2.5 image** and/or **B = Gemini 3.1 image**.
- Coverage: **15 of the 34 generated items** carry feedback. Scores range
  1/5–5/5; most rated items land 4–4.5/5, with one catastrophic outlier
  (Barry's B: 1/5).
- **Timing caveat:** ratings were done on generations made **before** the QI-4
  groundedness validator landed (commit b9a02ea, 2026-07-19). The "Still open?"
  column below states what the post-fix regenerated HTMLs (validator campaign,
  66/68 items) actually show, verified 2026-07-19.

## Issues and fixes

| # | Issue | Severity | Evidence (rated items) | Still open after drift fix? | Proposed fix |
|---|---|---|---|---|---|
| T1 | Broken runtime interactivity: blocked progression, checkboxes with no visual feedback / not working, question not rendered, blank review screen | **Major** — dominant failure class; behind every rating ≤4 with a "major" | Katto A, Colgate B, Barry's B (×3 issues, 1/5), Fillout real-estate A, Crossfit intake B, Atelier Eva B | **Yes.** JS behavior is statically invisible; validator demotes script-only findings to warnings. Complained items DO have `:checked` CSS in regens — these are JS wiring bugs, not missing styles | **P0:** Puppeteer interaction harness `evals/tools/interaction-check.mjs` — answer every question, assert DOM reflects it, walk steps, assert review screen populated |
| T2 | Submission fails at runtime; confirmation shown inline instead of dedicated view | **Major** | Founders Factory B ("Submission failed"), Extreme Realities A ("not working"), Extreme Realities B (inline confirmation) | **Yes.** QI-6 checks the submit URL is *present*, not that the code path fires | **P0:** same harness — intercept network, click submit, assert POST to `formResponse` carries every `entry.*` param (checkbox groups as repeated params), abort before it sends |
| T3 | Style-guide text leaks into form content ("Takes X minutes", unrelated header text) | **Major** (trust/groundedness) | Crossfit intake A, Crossfit feedback A+B, Extreme Realities B | **Yes — verified:** post-fix regens still say "Takes 1 min" (intake, both configs) / "Takes about 7 minutes" (feedback 3.1). Mechanism confirmed: text is Typeform chrome visible in the style-guide screenshot; the recreated Google Form has no time mention. QI-4 only catches *missing* text, not *added* text | **P1:** SI rule — style guide is a visual reference only; never copy words/numbers/claims visible in it. LLM judge (FI-3) as the automated catch |
| T4 | Invented validation not in the original (fake URL check blocks input) | **Major** | Founders Factory A | **Latent.** Not reproduced in post-fix regens (no `pattern=`/`type="url"`), but nothing prevents it | **P1:** SI rule — enforce only the original's required flags and input types; never add format validation. Harness also catches blocked submission it causes |
| T5 | Multi-step chrome inconsistency: hero image / footer disclaimers only on first (± last) page; notices need scrolling; stray whitespace | Minor, frequent | Atelier Eva A (×3), Barry's B, Founders Factory B, Katto B | **Yes.** Regens still vary (atelier 2.5: 3 footer nodes; katto 3.1: 1) — placement per step is model whim | **P1:** SI rule — persistent chrome (branding, hero treatment, disclaimers, footer) on every step, visible without scrolling |
| T6 | Widget UX conventions: date picker only opens from the text, no browser autofill | Minor, repeated verbatim | Dainty Florals A+B, McEwan A+B (date picker); Atelier Eva B (autofill) | **Yes.** Nothing addresses it | **P2:** SI rules — click anywhere in a date field opens the picker; `autocomplete` attributes on name/tel/email fields |
| T7 | Style guide's layout not followed (hero-left ignored; cover card flattened) | **Major** for the product's goal ("instruction following is not great") | Fillout event registration A+B, Fillout real-estate A+B (minor variant) | **Yes.** Nothing extracts layout facts from the guide today | **P1:** plan-step layout extraction — analyze phase writes explicit layout facts (hero position, card vs full-bleed, columns) into the plan; html_gen must follow unless prompt overrides. Measured by expansion P3 prompts + judge |
| T8 | Generated hero-image fit: off-brand, wrong colors, too tall | Minor | Colgate A, Extreme Realities A | **Yes.** Counter-signal: the rated 0-image generation scored 4.5/5 — a missing image costs less than a wrong one | **P2:** pass extracted palette + form subject into the image prompt; cap hero height (~40vh) in SI; prefer no image over a low-confidence one |

**Config observation (A vs B):** majors are spread across both configs (~5
each among rated rows), but the only catastrophic rating is B (Barry's 1/5),
and B renders more content via JS (barrys 3.1 regen: all 30 checks land in the
script corpus) — exactly where T1 failures live. Track per-config in the next
rating pass; not actionable alone.

**What the drift fix already covers:** missing/mutated original content and
missing static entry/submit/footer wiring are caught and auto-retried since
b9a02ea. Everything above is what static checking cannot reach.

## Priority order

| Priority | Work item | Fixes | Why this order | Effort |
|---|---|---|---|---|
| 1 | SI rule pack: no style-guide text transcription; no invented validation; persistent chrome on every step | T3, T4, T5 | Prompt-only, hours of work, immediately re-testable by regenerating the ~8 affected items and spot re-rating | Small |
| 2 | Interaction harness (`interaction-check.mjs`, Puppeteer) as an **eval-time metric** over the full set | T1, T2 | The severest rated failures; quantifies the true failure rate (today we only know ≥6 majors among 15 rated rows). Eval-only first — no latency/dependency added to serving | Medium |
| 3 | Plan-step layout extraction from the style guide | T7 | Core product goal (style adherence); rides along with the next SI iteration; measured by expansion P3 prompts | Medium |
| 4 | Widget UX + image-fit SI rules | T6, T8 | Minor-severity polish; cheap to bundle with any SI change | Small |
| 5 | LLM judge (FI-3), then fold runtime checking into post-generation per the item-2 decision rule (async repair and/or jsdom logic-gate — NOT a blocking Chromium gate) | T3, T7 at scale; T1, T2 at generation time | Judge is the scaling path for what static checks can't see; serving integration only after Phase 1 measures the real failure rate — see item-2 details for options and tradeoffs | Large |

## Details for priority items 1–5

The system instruction lives in `app/lib/gemini.ts` (RULES block, currently
numbered 1–18; 18 is the footer rule and must stay last-positioned in spirit —
append new rules after it and renumber nothing). The plan step is the
`announce_plan` function declaration in the same file (model must call it
first; its `summary` is a 1–2 sentence free-text visual plan surfaced in the
ChatPanel timeline).

### Item 1 — SI rule pack (T3, T4, T5)

Add three rules to the RULES block. Draft text (tune wording during
implementation, keep the ⚠️ markers for the trust-critical ones):

- **Rule 19 — style guide is visual-only (T3):** "⚠️ The attached style
  guide/reference image is a VISUAL reference only — take colors, typography,
  layout and mood from it. NEVER copy text visible in the image into the form:
  no headlines, claims, time estimates ('takes X minutes'), button labels,
  product names, or any other words or numbers that appear in the reference.
  All form text comes exclusively from the structure JSON."
- **Rule 20 — no invented validation (T4):** "Never add input validation the
  original form does not have. The only validation allowed is: required-field
  checks for questions whose `required` is true (rule 8), and the input types
  given in the structure. Do not add URL/email/phone format checks, pattern
  attributes, length limits, or custom 'invalid' error states beyond these. A
  user must be able to submit anything the real Google Form would accept."
- **Rule 21 — persistent chrome on every step (T5):** "In any multi-step
  layout, brand chrome must be consistent across ALL steps: the hero/branding
  treatment, any disclaimers or notices, and the rule-18 footer must appear on
  every step (or in a fixed region visible on every step), not only the first
  and last. The footer must be reachable without scrolling past dead
  whitespace — content should end near the footer, with no large empty gap."

Interactions to respect: rule 19 must not contradict rule 18 (the footer text
IS copied verbatim — it comes from the SI, not the image); rule 20 is an
extension of rule 8's existing "do not add required to optional fields";
rule 21 refines rule 14's per-step layout rules and rule 6's spacing language
(cite them in the rule text so the model links them).

Verification: regenerate the affected eval items (crossfit ×2, founders,
atelier, barrys, katto, extreme-realities) with the working-tree SI, grep
regens for leaked style-guide text ("Takes … min" for the crossfit pair),
`pattern=`/custom validation for founders, and count `data-gforms-footer`
regions per step; then spot re-rate.

### Item 2 — interaction harness (T1, T2)

A runtime checker that uses a form the way a human does and reports what
breaks. Built as an **eval tool first**; folding it into post-generation
checking is a separate, later decision (see "Serving integration options").

#### What to build (Phase 1 — eval tool)

New file: `evals/tools/interaction-check.mjs`. Puppeteer is already installed
in `evals/tools/` (used by `lib/extract.mjs` — copy its launch pattern). No
app changes in this phase. CLI conventions follow the house style: named
`--flag=value` arguments only, unknown arguments abort with an error
(fail-closed, DR-6), resumable via a `--report=<file.json>` that skips
already-passing rows on rerun.

```
node interaction-check.mjs --items=<id>[,<id>...] --source=<dir-of-html|live> --report=<file.json>
```

Inputs per item: the generated HTML (a saved file, or the live `/f/{id}` URL —
live URLs are prod data, reading them is safe, DR-2 concerns writes only) and
the item's structure JSON from `evals/manifest.json` (title, questions with
`entry.*` IDs, types, options, required flags).

Per-item algorithm — run these in order, recording violations instead of
stopping at the first:

1. **Load** the page. Wait for network idle + a settle delay (~2s; generated
   forms animate in). Set a desktop viewport (1440×900).
2. **Locate each question's control** by its `entry.*` name:
   `[name="entry.X"]` for native inputs. If no static element carries the
   name, fall back to finding the question's text on the page and searching
   its nearest container for clickable controls. If neither exists →
   violation `question_never_shown`.
3. **Answer every question** according to its type, and assert the page
   responds:
   - radio / linear scale: click the *styled* control (the label/card/number
     the user sees — generated forms usually hide the native input with
     `opacity:0` or `display:none`; clicking the hidden input directly can
     succeed while the visible UI stays dead, which would mask exactly the
     bug we're hunting). Then assert via `page.evaluate` that the native
     input became `checked`, AND that some visible styling changed (the
     control or an ancestor gained a class, or a `:checked`-dependent
     element became visible). Style-only-no-state or state-only-no-style are
     both violations: `selection_no_feedback`.
   - checkbox: same, and additionally toggle a second option to assert
     multi-select works without clearing the first (the Atelier Eva
     "cross selection" bug).
   - short_answer / paragraph: `type()` a value, assert `input.value`.
   - dropdown: select an option, assert `select.value`.
   - date/time: set the value; also click the styled container and note (not
     fail) whether a picker opens — this feeds the T6 rules.
4. **Walk multi-step flows**: after answering the visible step's questions,
   find and click the advance control (button whose text matches
   `next|continue|start|begin|→` case-insensitively; treat "no advance
   control anywhere" as single-page and skip walking). Assert the visible
   step actually changed after the click; if it did not (and required
   questions were answered) → violation `progression_blocked`. Cap the walk
   at (question count + 3) clicks to guarantee termination.
5. **Review screen** (if a step shows several already-answered values):
   assert every answered value appears in its text → else `review_blank`.
6. **Submission**: enable `page.setRequestInterception(true)` **before**
   loading the page. Click the submit control. Assert a request fires whose
   URL contains the item's `formResponse` URL and whose POST body contains
   every answered `entry.*` param (checkbox groups as repeated params).
   **Abort the intercepted request** — the harness must never actually
   submit to the real Google Form. Missing request → `submit_not_fired`;
   missing params → `submit_params_missing`. After the (aborted) submit,
   note whether the page swapped to a confirmation view (feeds T6/T2's
   inline-confirmation complaint; the abort will look like a network error
   to the page, so only *note* this, never fail on it).
7. **Report**: emit one JSON row per item: `{ id, config, violations: [...],
   durationMs }` using the QI-4 `Violation` shape (`code`, `severity`,
   `message`, `expected`, `found`) with the new codes above. Errors from the
   harness itself (timeout, crash) are recorded as `harness_error`, not as
   form violations.

**Self-test requirement** (same doctrine as `check-drift.mjs --self-test`):
before trusting results, run the harness against 2–3 known-good saved regens
and against planted-fault copies (delete the submit listener; add
`pointer-events:none` to an option; hide one question) and confirm it reports
exactly the planted faults. A harness that can't catch planted faults must
not be used to gate anything.

Known limitations to write into the tool's header comment: conditional/
branching forms may make some questions unreachable (record `question_never_
shown` with a note, don't hard-fail the run); `showPicker()`-style behaviors
need real user gestures and may not work headless; visual "feedback" is
detected structurally (class/state change), not by pixel comparison — a
technically-toggling but invisible style change can still pass.

#### Phase 1 usage as an eval tool

- Run over the 66 saved post-fix regens → the first **measured** T1/T2
  failure rate (today's knowledge is only "≥6 majors among 15 rated rows").
- Add to the standard eval loop next to check-drift: every future generation
  batch gets `checkerDrift` AND `interactionViolations` columns in its
  report.
- Rerun after the item-1 SI rule pack lands to measure whether prevention
  alone moved the rate.

#### Serving integration options (Phase 2 — decide AFTER Phase 1 data)

Latency context, measured 2026-07-19: generation p50 ≈ 85s, p90 ≈ 114s. The
harness check itself is ~2–10s (local HTML, no network) — ~5% overhead. The
expensive part is the **failure path**: a corrective retry is a full Gemini
round-trip, +30–60s. Effective added latency ≈ failure rate × retry time.
The other constraint is infra: the app serves from Vercel, and headless
Chromium in a serverless function means a ~50MB bundle, cold starts, and
function-duration pressure on a route that already streams SSE for 85s+.

| Option | What it is | Latency cost | Coverage | Main risk / cost |
|---|---|---|---|---|
| A. Blocking gate, full Chromium in serving | Run harness after html_gen, retry on error before returning | +2–10s always; +30–60s on failure | Full (logic + visual feedback) | Chromium-on-Vercel infra pain; slowest path. **Rejected** |
| B. Async repair | Return the form immediately; run harness in background; on failure, regenerate the fix and update the stored form at the same `/f/{id}` (Redis write), optionally notify in UI | Zero user-perceived | Full | A broken form is briefly live; needs a background execution path + an idempotent re-write; Redis writes are prod writes (DR-2) — repair job must be careful |
| C. jsdom-subset gate in serving | Port only the *logic* checks (progression unblocks, submit POST fires with all entries) to jsdom — no browser, milliseconds, serverless-friendly. Visual-feedback checks stay eval-only | +<1s; retry only on logic failure | Partial (catches dead submit / blocked flow — the catastrophic class; misses invisible-feedback bugs) | jsdom fidelity: no layout, partial CSS — keep checks to DOM/state/network logic only, or false results will erode trust |
| D. Eval-only forever | Harness remains a regression instrument; prevention via SI rules | Zero | Zero at serving time | Broken forms ship if prevention regresses; acceptable only if measured failure rate is ~0 |

#### Recommendation

1. Build Phase 1 and run it on the existing regens. Do not touch serving yet.
2. Decision rule on the measured failure rate for T1/T2-class errors:
   - **< ~2%** → option D. Keep the harness in the eval loop as regression
     protection; revisit only if the rate climbs.
   - **~2–10%** → option C. The jsdom logic-gate catches the "form is a dead
     end" class at negligible latency; visual-feedback bugs keep being caught
     in evals and fixed via SI.
   - **> ~10%** → option B alongside C: C stops the worst failures at the
     gate, B repairs what C can't see. Revisit the SI before accepting this
     state — a >10% runtime failure rate is a prompt problem, not a
     checking problem.
3. Option A stays rejected regardless of rate: same coverage as B at strictly
   worse latency and the worst infra fit.

### Item 3 — plan-step layout extraction (T7)

Two changes in `app/lib/gemini.ts`:

1. **Extend the `announce_plan` declaration** with a required `layout`
   object parameter alongside `summary`:
   - `type`: `"single-page" | "question-per-step" | "multi-section"`
   - `source`: `"prompt" | "style-guide" | "model-choice"` — where the layout
     decision came from (prompt overrides guide overrides choice, matching
     rule 13's precedence)
   - `heroPlacement`: `"left" | "right" | "top" | "background" | "none"`
   - `coverStyle`: `"card" | "full-bleed" | "none"` (the Fillout real-estate
     miss: guide showed a card cover, output flattened it)
2. **SI addition (extend rule 13):** "Before planning, READ the layout of the
   style guide: where the hero image sits, whether content is in a card or
   full-bleed, single vs multi column, one-question-per-screen vs scrolling.
   If the prompt does not override it, your announced layout MUST match what
   the guide shows, and the generated HTML must match your announced layout."

Why structured rather than prose: the `layout` object gives the LLM judge (and
eventually a static check) a machine-readable claim to verify the HTML
against — same philosophy as QI-4's "claim vs artifact" checking. The ChatPanel
timeline keeps showing only `summary`; no UI change needed.

Verification: the expansion prompt bank's P3 class (guide layout + new theme)
and the two rated Fillout items are the test set; the judge rubric gets "does
the generated layout match the announced `layout` object?".

### Item 4 — widget UX + image-fit rules (T6, T8)

Widget UX (SI additions, can share one rule number):

- **Date/time fields:** the entire visible field must open the picker —
  wrap the native input so a click anywhere on the styled container calls
  `showPicker()` (guard with try/catch: it requires a user gesture and recent
  browsers) or focuses the input; never a design where only the text glyphs
  are clickable.
- **Autofill:** personal-data inputs must carry the matching `autocomplete`
  attribute — `name`, `email`, `tel`, `street-address`, `postal-code` — chosen
  from the question's semantics; other fields get `autocomplete="off"` only if
  autofill would be wrong, otherwise leave unset.
- **Post-submit view:** after a successful submit, replace the form with a
  dedicated confirmation view (full state change, matching the form's theme) —
  never an inline banner above a still-visible form.

Image fit (edits to the IMAGE RULES block, which already exists in the SI):

- The `generate_image` prompt the model writes must include: the brand's
  dominant colors (as hex values read from the style guide), the form's
  subject domain, and "no text or lettering in the image" (prevents T3-style
  leakage via imagery and the Extreme Realities 'unrelated header content'
  failure).
- Hero images: cap rendered height (~40vh desktop, less on mobile) and
  require `object-fit: cover` — addresses "hero too tall".
- Confidence guard: if the style guide gives no usable brand signal for
  imagery, generate NO image rather than a generic one — the rated 0-image
  form scored 4.5/5; a wrong image rates worse than none.

Verification: regenerate dainty-florals + mcewen (date picker), atelier
(autofill), extreme-realities + colgate (image fit); manual click-through for
the picker/autofill behaviors (they are runtime — the item-2 harness can
assert the `autocomplete` attributes and confirmation-view swap statically
once it exists).

### Item 5 — LLM auto-judge (T3, T7 at scale; Dimensions 3 & 4)

An automated rater that scores generated forms against the human rubric
(`evals/rater_instructions.md`). Everything an implementer needs is below;
where a number is an estimate it says so and gives the way to measure the
real value.

#### Division of labor — what the judge must NOT score

Dimension 1 (functionality) and Dimension 2 (groundedness) are covered
deterministically (QI-4 validator, check-drift, the item-2 harness). The
judge never re-scores them — a judge opinion on groundedness is strictly
worse than the deterministic answer. The judge owns only what needs
perception:

- **Dimension 3** — instruction following: did the output obey the prompt
  and the style guide, including layout adherence (theme T7) and, once
  item 3 lands, agreement with the announced `layout` object.
- **Dimension 4a/4b** — aesthetics and legibility as actually rendered
  (gradients/images blind the static contrast checker; the judge sees
  pixels).
- **Additive fabrication** (theme T3): text present in the form but absent
  from the structure JSON, ignoring standard UI labels (Next, Back, Submit,
  progress text, "Your answer" placeholders). Deterministic checking of this
  needs an ever-growing allowlist; a judge holding the screenshot and the
  structure does it trivially.

#### Inputs per judged form

1. Screenshots of the rendered form (see per-mode budgets below). Reuse the
   item-2 harness's per-step screenshot trail when available — do not build
   a second browser pipeline. Fallback when the harness errored: a plain
   scroll-through capture (no interaction) so judge coverage survives
   harness crashes.
2. The style-guide image, if the item has one.
3. The item's structure JSON from `evals/manifest.json` (title, description,
   questions, options).
4. The user prompt.
5. The rubric text, injected verbatim from `evals/rater_instructions.md` so
   human and judge grade against the same document.

**Never judge a form the harness marked `progression_blocked` or
`harness_error`** — its screenshots are a partial artifact; scoring it
pollutes averages. The item is already failed by the harness; record
`skipped_harness_failed` in the judge report.

#### Output schema (per form, JSON — temperature 0, structured output)

```json
{
  "id": "barrys-lead-gen",
  "config": "gemini-3.1-flash-image-preview",
  "flags": {
    "text_leaked_from_guide":      { "raised": true,  "evidence": "form says 'Takes 1 minute', absent from structure" },
    "layout_ignores_guide":        { "raised": false, "evidence": "" },
    "prompt_instruction_violated": { "raised": false, "evidence": "" },
    "illegible_text_region":       { "raised": false, "evidence": "" },
    "chrome_inconsistent_across_steps": { "raised": true, "evidence": "hero only on step 1" },
    "image_off_brand":             { "raised": false, "evidence": "" }
  },
  "scores": { "d3_instruction_following": 2, "d4a_aesthetics": 4, "d4b_legibility": 5 },
  "rationale": "…"
}
```

Flags map 1:1 to themes T3/T7/T5/T8 + rubric 4b. Flags are the primary
signal (LLM judges are far more reliable at "is X present" than at absolute
scalars); scores exist mainly so human–judge agreement is measurable.

#### Two modes

The same script, `evals/tools/judge.mjs`, with `--mode=comprehensive` or
`--mode=regression`. **Subset rule (invariant):** regression mode's flags
must be a strict subset of comprehensive mode's flag set, judged from a
subset of the same screenshots. The cheap mode may MISS things (that is the
trade); it must never be able to DISAGREE — any regression alarm must
reproduce under comprehensive mode on the same evidence.

| | Mode 1: comprehensive | Mode 2: regression |
|---|---|---|
| When | Milestones: after an SI change lands, before merge to main, calibration | Every SI tuning iteration; CI-shaped |
| Model | Sonnet (`claude-sonnet-5`) | Haiku (`claude-haiku-4-5-20251001`) |
| Paid via | **Pro subscription** — shell out to Claude Code headless: `claude -p "<judge prompt with absolute screenshot paths>" --output-format json --allowedTools Read` (the model reads the images via Read; the JSON result's `usage` field gives real token counts) | API, Batch endpoint (50% off; regression runs are latency-insensitive and must not compete with the interactive session budget). Base64 images, prompt static-first for caching |
| Screenshots | 5–6: first step + one middle step + review step at ~900px wide, ONE full-resolution 1440×900 desktop (legibility flag needs real pixels), one mobile ~390px | 3: first step, one later step, mobile — all downscaled to ~750px wide (tokens scale with pixel area) |
| Output | All flags + evidence, per-dimension scores, short rationale; pairwise A-vs-B on contested pairs only (flags differ or scores within 1 point), each pair run twice with positions swapped (position bias) | Flags + one-line evidence only. No scores, no rationale, no pairwise |
| Est. tokens/form | ~15k in / ~1.5k out | ~4–5k in / ~300 out |
| Est. 40-form run | **~600k input tokens** ≈ around half a Pro session (estimate — see budget guardrails) | ~180k Haiku tokens ≈ cents via Batch API |
| Extra behavior | — | `--baseline=<report.json>`: output is a diff (new flags raised / cleared vs baseline); exit non-zero on new flags. Delta-aware via `--items=` (only forms an SI change touched) |

#### Budget guardrails (required, not optional)

Pro session token quotas are not published and vary — treat every number
above as an estimate to be replaced by measurement:

1. `--budget=<tokens>` argument: keep a running total from each call's
   `usage` field; abort cleanly (fail-closed) when crossing it, leaving the
   report resumable.
2. Resumable report (house pattern): rerunning with the same `--report=`
   skips rows that already have a non-error result — a session-cap hit at
   form 28 resumes at 29 after the window resets.
3. Pilot-first (DR-7): run 3 forms, read measured tokens/form from the
   report, THEN launch the remaining 37.
4. Judge-model choice: judge must be a different model family from the
   generator (generator is Gemini; Claude judging Gemini avoids
   self-preference bias). If the generator ever becomes Claude, switch the
   judge or add cross-family verification.

#### Calibration gates (must pass before the judge's output is trusted)

Calibration set: the 15 human-rated rows in the owner's eval doc; their
pre-fix generations are still live at the prod `/f/{id}` URLs recorded
there.

1. Run comprehensive mode on those exact generations.
2. Gate (a): the judge flags every human-found MAJOR (Barry's B must score
   badly and raise flags; Founders B, Katto A, Colgate B, Crossfit-intake B,
   Fillout-RE A, Fillout-event A+B must raise the matching flag).
3. Gate (b): score ordering roughly agrees with the owner's ratings
   (Barry's B is the worst; WWF/Dainty near the top).
4. Gate (c): no hallucinated majors on the clean 4.5–5/5 items (WWF, Dainty
   Florals, Fillout onboarding, Barry's A).
5. If a gate fails: tune the judge prompt, not the pipeline. Re-run until
   all three pass. Record the calibration result in this doc.
6. Then validate regression mode against comprehensive mode (not against
   the human): same forms, regression flags must agree with comprehensive
   flags wherever both judge the same evidence.

Same doctrine as the harness self-test and check-drift `--self-test`: an
instrument that cannot reproduce known ground truth does not gate anything.

#### Known limitations (write into the tool's header comment)

1. **Stills cannot show behavior**: hover/focus states, transitions,
   animation jank, sticky-scroll behavior are invisible to screenshots —
   the harness covers the logic half; a sliver (visually-broken transitions
   that are structurally fine) is covered by neither and stays with the
   milestone human pass.
2. **Reachability coupling**: the judge sees only steps the harness reached
   — handled by the skip rule + fallback capture above.
3. **Capture fidelity**: screenshots need the settle-wait discipline of
   `lib/extract.mjs` (fonts/animations); viewport captures miss
   below-the-fold, full-page captures of 100vh-per-step forms render
   strangely — prefer per-step captures.
4. **Judge perception limits**: vision models are weak at fine geometry
   ("questions not centered" may be missed) and exact color values; the
   750px downscale trades away exactly this acuity, which is why
   comprehensive mode keeps one full-res capture and pixel-precision issues
   stay with the human pass.

#### Build order for the implementer

1. Screenshot capture path: extend the item-2 harness to save per-step
   PNGs; add the no-interaction fallback capture. (If building the judge
   before the harness, start with the fallback capture only.)
2. `judge.mjs` comprehensive mode, hardcoded to 3 pilot items; verify JSON
   output parses and tokens/form is within ~2× of the estimate.
3. Calibration run on the 15 rated rows; iterate on the judge prompt until
   the three gates pass.
4. Regression mode (same prompt minus scores/rationale, smaller screenshot
   set, Haiku via Batch API); validate the subset rule against
   comprehensive results.
5. Wire regression mode into the eval loop next to check-drift; document
   both modes in `evals/tools/README.md`.
