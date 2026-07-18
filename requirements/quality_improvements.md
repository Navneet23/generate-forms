# Forms AI Restyler — Quality Improvements Requirements

## Overview

This document captures quality improvements identified by analysing the evaluation rubric
(`rater_instructions.md`) against the current feature and system instructions (SI) in
`app/lib/gemini.ts`. The rubric evaluates generated forms on four stack-ranked dimensions:

1. **Functionality & stability** — navigation, submission, interaction feedback
2. **Groundedness** — content fidelity to the original Google Form
3. **Completeness & instruction following** — prompt and style guide adherence
4. **Visual aesthetics & layout** — legibility, contrast, scaling, cohesion

Each requirement below states the problem, the rubric linkage, the requirement itself, and
how to address it. Requirements are grouped by rubric dimension and tagged:

- **[SI]** — change to the system prompt in `buildSystemPrompt()` (`app/lib/gemini.ts`)
- **[Structural]** — new code in the generation pipeline

> **Design caution:** the SI rule list is already long, and long rule lists contribute to
> instruction drift. SI additions below should be batched compactly (short rules, grouped
> by theme) rather than appended as many new standalone numbered rules.

## Implementation status (2026-07-18)

| Requirement | Status | Notes |
|---|---|---|
| QI-1 Footer notices | ✅ Implemented | Canonical footer via `buildGoogleFormsFooter(formId)` — full notices, links, Report/abuse URL; fixed 12px sizing after mobile feedback |
| QI-2 Google Forms wordmark | ✅ Implemented | Grey text wordmark (20px) in the canonical footer; icon/image/SVG replacements forbidden |
| QI-3 Placeholder discipline | ✅ Implemented | SI rule 15 |
| QI-4 Groundedness/submit validator | ⬜ Not started | Next major task |
| QI-5 Selection feedback | ✅ Implemented | Extended SI rule 12 (selected/hover/focus states) |
| QI-6 Submit wiring verification | ⬜ Not started | Lands with QI-4 |
| QI-7 Layout guidance | ✅ Implemented | New SI rule 13 |
| QI-8 Style guide depth | ✅ Implemented | Extraction checklist + conditional layout replication in style-guide message text |
| QI-9 Contrast | ✅ Implemented | SI rule 16 |
| QI-10 Overflow | ✅ Implemented | SI rule 17 |
| QI-11 Linear scale / responsive | ✅ Implemented | Amended SI rules 6 & 9; rule 6 also gained mobile spacing compression + content-sized containers after live testing on narrow screens |

Verified via live generation on the dev server (cupcake-workshop test form): footer,
wordmark, and mobile rendering iterated against real screenshots. Full eval-set run
against the rubric still pending.

---

## Dimension 2 — Groundedness (guaranteed failures today)

These are checks the current output can never pass — not risks, but certain rubric failures.

### QI-1: Google Forms footer notices [SI]

**Problem:** The rubric requires the standard Google Forms notices at the bottom of the
form ("Never submit passwords through Google Forms") and lists their absence as a named
failure mode ("Missing notices at the bottom of the form"). The SI never mentions them and
the scraper does not extract them, so no generated form includes them.

**Product decision (confirmed):** Preserving Google Forms notices and branding is desired —
generated forms should still read as Google Forms forms.

**Requirement:** Every generated form must include a footer block matching the real
Google Forms responder footer:
- "Never submit passwords through Google Forms."
- "This content is neither created nor endorsed by Google. - Contact form owner - Terms
  of Service - Privacy Policy" (with working links: Contact form owner → the original
  form's viewform URL; Terms → `https://policies.google.com/terms`; Privacy →
  `https://policies.google.com/privacy`)
- "Does this form look suspicious? Report" (link →
  `https://docs.google.com/forms/d/e/{formId}/abuse`)

The footer must be styled to harmonise with the generated design (muted/secondary text)
but must always be present and legible, with links visibly underlined.

**How to address:**
- The notices are boilerplate and the links are constructible from `structure.formId` —
  no scraper changes needed. A `buildGoogleFormsFooter(formId)` helper in `gemini.ts`
  produces the canonical footer HTML, which is interpolated verbatim into the SI with an
  instruction to copy it exactly (styling may be adjusted; text/links/wordmark may not).
- A `data-gforms-footer` attribute on the footer element lets the QI-4 validator assert
  its presence deterministically.
- Note: "Contact form owner" on real Google Forms opens a JS dialog that cannot be
  replicated; linking to the original form (where that dialog exists) is the accepted
  approximation.

### QI-2: Google Forms wordmark [SI]

**Problem:** The rubric lists "Missing Google Forms logo" as a named failure mode. The SI
never asks for it — and the no-images branch forbids images generally.

**Requirement:** Every generated form must display the **"Google Forms" text wordmark**
as it appears on real responder pages: grey text ("Google" medium weight, "Forms"
regular, `#5f6368`), positioned below the footer notices. It must NOT be rendered as the
purple document-glyph icon, a logo image, or an invented SVG — the real responder footer
uses the text wordmark. It must render regardless of whether AI image generation is
enabled.

**How to address:**
- The wordmark is part of the canonical footer HTML from `buildGoogleFormsFooter()`
  (QI-1) — plain styled text, so it is self-contained and unaffected by the no-images
  restriction (the `IMAGE RULES` branch notes this explicitly).
- The SI instructs: never replace the wordmark with an icon, logo image, or SVG.
- Validator (QI-4) asserts the wordmark text is present within the
  `data-gforms-footer` element.

### QI-3: Placeholder text discipline [SI]

**Problem:** The rubric flags placeholder text that is "changed from the default or doesn't
match the question" as a (minor) failure mode. The SI is silent on placeholders, so the
model freely invents them (e.g. a themed placeholder like "Tell us your magical name!").

**Requirement:** Text inputs may use only generic placeholder text ("Your answer" for
short answer / paragraph, format hints like "DD/MM/YYYY" for date). Placeholders must
never contain invented content, themed copy, or text unrelated to the question.

**How to address:**
- Add one SI rule: placeholders are limited to "Your answer" (text inputs) or a neutral
  format hint (date/time); never invent themed or decorative placeholder copy.
- Cheap to verify by eye during evals; validator enforcement optional (low priority since
  the rubric treats this as very minor).

### QI-4: Post-generation groundedness & submit-wiring validator [Structural]

**Problem:** Question text drift is a documented known limitation (see
`documentation/architecture.md`): despite strong SI language, Gemini occasionally
paraphrases question text or option labels. The rubric's groundedness scale is harsh — a
single paraphrased question rates "Not grounded", the worst rating on the #2-priority
dimension. Prompt language has plateaued (commit `f5599da` already strengthened it and
drift persists). Separately, submission failure is the rubric's #1 failure mode, and
nothing today verifies the generated JS is actually wired correctly.

**Requirement:** After HTML generation, deterministically validate the output against the
scraped `FormStructure` and the submit contract. On violation, automatically remediate
(retry with corrective feedback, or auto-correct where safe). Surface validation as a
progress-timeline step.

**Checks to perform (against `structure` and `submitUrl`):**

| # | Check | Guards |
|---|---|---|
| 1 | Form title and description appear verbatim | Groundedness |
| 2 | Every `questions[].text` appears verbatim | Groundedness (drift) |
| 3 | Every option value for MCQ/checkbox/dropdown appears verbatim | Groundedness |
| 4 | Every `entry.XXXXXXXXX` name attribute is present exactly once per question | Functionality (submit routing) |
| 5 | Input types match question types (radio for multiple_choice, checkbox for checkboxes, `<select>` for dropdown, etc.) | Groundedness (type swap) |
| 6 | Required flags: required questions have validation; optional questions have none | Groundedness |
| 7 | A `fetch` POST to `submitUrl` exists in the script | Functionality |
| 8 | Footer notices (QI-1) and logo marker (QI-2) present | Groundedness |
| 9 | No question from the structure is missing from the HTML | Groundedness |

**How to address:**
- New module `app/lib/validate-form.ts` exporting
  `validateGeneratedForm(html, structure, submitUrl): Violation[]` where each `Violation`
  has a machine-readable code, human-readable message, and the expected vs found values.
- Parsing: use a lightweight HTML parser (e.g. `node-html-parser`) for attribute/element
  checks (4, 5, 6); plain string containment on decoded text for verbatim checks
  (1, 2, 3, 9 — normalise whitespace and HTML entities before comparing).
- Wire into `generateForm()` in `gemini.ts` after the final HTML is produced:
  1. Run validator. If clean → done.
  2. If violations → send a corrective follow-up message in the same chat session listing
     each violation precisely ("Question 3 text must be exactly: '…' but you rendered:
     '…'"), asking for the complete corrected HTML. Re-validate.
  3. Cap at 2 retries. If violations persist, return the HTML anyway but include
     violations in the result so the UI can show a warning (never hard-fail a generation
     the creator could still accept).
- **Auto-correct fast path:** for pure text drift where the structural match is
  unambiguous (e.g. the element with the question's `entry` ID has slightly different
  label text), directly string-replace the drifted text with the verbatim text and skip
  the model round-trip. Fall back to the retry loop for anything structural.
- Emit progress events: `validate/started`, `validate/completed`, or `validate/failed`
  (with detail listing what was fixed/retried) so the timeline shows the step. Add the
  step to `TimelineMessage` labels.
- This validator is the single highest-leverage change in this document: it converts the
  top two rubric dimensions from prompt-hoped into deterministic guarantees.

---

## Dimension 1 — Functionality & stability

### QI-5: Selection feedback states [SI]

**Problem:** "Visual feedback on selecting answer options" is a named rubric failure mode.
The SI never requires selected/hover/focus states, so flat custom-styled options can leave
respondents unsure whether their click registered.

**Requirement:** Every selectable option (radio, checkbox, dropdown option, linear-scale
point) must have a clearly visible selected state distinct from its resting state (e.g.
filled indicator + background/border change), plus a hover state on pointer devices and a
visible keyboard focus state.

**How to address:**
- Add one SI rule under the visual-distinction rule (current rule 12), since they're
  thematically adjacent: "Selected options must be unmistakably highlighted (filled
  indicator AND a background or border change). Provide hover and keyboard-focus states."
- Verified visually during evals; no validator check (state styling isn't reliably
  detectable statically).

### QI-6: Submit wiring verification [Structural — covered by QI-4]

**Problem:** Submission failure is the rubric's most severe common failure mode, currently
guarded only by prompt rules.

**Requirement:** Statically verify the generated form's submit path before returning it to
the creator: all entry names present (QI-4 check 4), fetch POST to the proxy URL exists
(check 7), checkbox values collected as arrays (inspect the serialisation code where
feasible; at minimum assert checkbox inputs share the same `name` so the collection code
can find them).

**How to address:** Implemented as part of the QI-4 validator — listed separately because
it guards Dimension 1 rather than Dimension 2, and should be called out in eval analysis.

---

## Dimension 3 — Completeness & instruction following

### QI-7: Layout selection guidance [SI]

**Problem:** The rubric's "Wrong Output Format" failure mode is about layout type (e.g.
generating question-by-question when single-page was requested). The SI has detailed
question-by-question rules but no guidance on *when* to choose which layout.

**Product decision (confirmed):** When the prompt and style guide do not specify a layout,
**any layout is acceptable** — the model may choose freely.

**Requirement:**
- If the prompt or style guide specifies or clearly implies a layout (single-page,
  question-by-question, multi-section), the generated form MUST use that layout.
- If neither specifies one, the model may pick whichever layout best suits the form's
  length and tone — but must apply it consistently and follow the layout-specific rules
  (e.g. current rule 13 for question-by-question).

**How to address:**
- Add a short SI rule ahead of the question-by-question block: "Layout: if the creator's
  request or style guide indicates a layout, follow it exactly. If not, choose the layout
  that best fits the form. Never mix layouts within one form."
- On iterative turns, the layout of the previous HTML should be preserved unless the new
  prompt asks to change it — add this to the same rule ("preserve the existing layout
  across edits unless asked to change it").

### QI-8: Style guide extraction depth [SI + message text]

**Problem:** Dimension 3 weights style-guide matching heavily ("Use the colors of this
brand image…", "Mismatched Style" failure mode), but the entire instruction today is one
sentence: "Use the visual style of the image above as a reference."

**Requirement:** When a style guide image is provided, the model must deliberately extract
and apply: colour palette (dominant + accent colours), typography feel (serif/sans,
weight, formality), spacing/density, corner radius / border treatment, and overall mood.

Layout handling depends on what the user asked:
- **Default (no layout instruction):** extract the style guide's *visual language* only —
  do not clone its layout/structure.
- **User asks to follow the style guide's layout** (e.g. "create a form with a similar
  layout"): the generated form SHOULD mirror the style guide's layout/structure as closely
  as the form content allows, in addition to its visual language. This ties into QI-7 —
  a layout implied by the style guide plus the user's instruction counts as a specified
  layout and must be followed.

The optional "focus on" note narrows which aspects to prioritise.

**How to address:**
- Strengthen the style-guide message text in `generateForm()` (the `parts.push` block for
  `styleGuide`): replace the single sentence with an explicit extraction checklist
  (palette, typography, spacing, corners, mood) and the conditional layout boundary:
  visual language only by default; mirror the layout too when the creator's prompt asks
  for it. Since the message text is built alongside the user prompt, the wording should
  defer to the prompt: "If the creator's request asks to follow this image's layout,
  replicate its layout/structure; otherwise use it only as a visual style reference."
- Keep this in the per-message text (not the SI) since it only applies when a style guide
  is attached — this avoids growing the SI for a conditional feature.

---

## Dimension 4 — Visual aesthetics & layout

### QI-9: Contrast rule [SI]

**Problem:** "Hard to Read (Bad Contrast)" and "Distracting Backgrounds" are named failure
modes. The SI only addresses contrast for AI-generated background images (overlay
requirement) — there is no general text-contrast rule.

**Requirement:** All text must meet approximately WCAG AA contrast (4.5:1 for body text,
3:1 for large headings) against its actual rendered background, including text over
gradients, images, and coloured cards. Footer notices (QI-1) included.

**How to address:**
- Add one SI rule stating the contrast requirement with the concrete ratios, plus:
  "when text sits on an image or gradient, add an overlay or text shadow sufficient to
  restore contrast."
- Full programmatic contrast checking is out of scope (requires rendering); rely on the
  SI rule + eval eyeballing. Revisit if evals show persistent contrast failures.

### QI-10: Overflow, clipping and wrapping [SI]

**Problem:** Rubric section 4b (Visual Legibility) is entirely about content spilling out
of containers or being cut off. The SI says nothing about overflow control.

**Requirement:** Text must always wrap within its container — never clip, overlap, or
spill. Long question text and long option labels must wrap gracefully. Fixed heights on
text containers are forbidden. Any intentionally scrollable region must show a scrollbar.

**How to address:**
- Add one SI rule: "Never clip or overflow text. Use word-wrap/overflow-wrap, avoid fixed
  heights on text containers, and test mentally against the longest question and option
  text in the structure."
- Low-cost, high-frequency failure class — worth its own rule despite SI-length caution.

### QI-11: Linear scale responsiveness (amend existing rule 9) [SI]

**Problem:** Current SI rule 9 mandates linear scales render as "a single horizontal row —
never stack them vertically", but a 1–10 scale forced into one row on a narrow phone
overflows or shrinks touch targets — exactly the rubric's "Improper Scaling for narrow
screens" failure mode. The rule as written conflicts with rule 6 (fully responsive).

**Requirement:** Linear scales remain a single horizontal row on desktop. On narrow
screens the row must degrade gracefully: evenly compress with a minimum touch-target size
(~40px), and if the scale genuinely cannot fit, allow horizontal scrolling within the
scale container — never overflow the viewport or clip endpoints/labels.

**How to address:**
- Amend rule 9 in place (don't add a new rule): append the narrow-screen behaviour to the
  existing rule text.
- While editing rule 6, strengthen general responsiveness with concrete constraints:
  minimum ~16px body font on mobile, no fixed pixel widths on the main form container,
  content column max-width with auto margins on wide screens.

---

## Priority & sequencing

| Priority | Requirement(s) | Type | Rationale |
|---|---|---|---|
| 1 | QI-1, QI-2 (notices + logo) | SI | Guaranteed rubric failures; trivial fixes |
| 2 | QI-4 / QI-6 (validator) | Structural | Deterministic guarantee on the top two dimensions |
| 3 | QI-5, QI-3 (feedback states, placeholders) | SI | Named failure modes; one-line rules |
| 4 | QI-7 (layout guidance) | SI | Named failure mode; confirmed product decision |
| 5 | QI-9, QI-10, QI-11 (contrast, overflow, scale) | SI | Dimension 4 + real functional risk on mobile |
| 6 | QI-8 (style guide depth) | Message text | Dimension 3 depth; conditional feature |

All SI changes (QI-1, 2, 3, 5, 7, 9, 10, 11) should land as **one batched SI revision**
so the rule list is reorganised compactly rather than grown item-by-item, and so evals
compare exactly one before/after SI pair.

## Verification

- **Before/after eval run:** once the eval set is in `evals/`, run the full set against
  the pre-change SI and the post-change SI + validator, and rate per the rubric.
- **Validator unit tests:** feed known-bad HTML fixtures (drifted question text, missing
  entry ID, swapped type, missing notices) and assert each violation is caught; feed a
  known-good fixture and assert zero violations.
- **Smoke test:** generate against a live test form covering all 8 supported question
  types; verify notices, logo, selection feedback, and mobile preview manually.
