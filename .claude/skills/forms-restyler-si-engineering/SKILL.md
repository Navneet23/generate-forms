---
name: forms-restyler-si-engineering
description: Load before reading or modifying the Gemini system instruction / prompt layer in app/lib/gemini.ts, changing generation behaviour, or diagnosing why generated forms look/behave a certain way. Covers SI anatomy, the numbered rule list (why each rule exists, what breaks if you weaken it), the canonical footer, the function-calling flow, style-guide handling, the open question-text-drift limitation, and how to change the SI without regressing a past incident. Triggers — "edit the system prompt", "change gemini.ts rules", "why does the SI say X", "add a rule to the SI", "the footer looks wrong", "images aren't generating", "form text got rewritten", "mobile footer is huge", "prompt engineering", "buildSystemPrompt", "buildGoogleFormsFooter".
---

# Forms AI Restyler — SI Engineering

The **system instruction (SI)** — the string built by `buildSystemPrompt()` in
`app/lib/gemini.ts` — is this project's core asset. It is the only thing that
tells Gemini 3 Flash how to turn a scraped `FormStructure` into a styled,
self-contained HTML page. Prompt text is production code: it is versioned,
reviewed, and gated exactly like any other change (see
**forms-restyler-change-control** §4 for the merge protocol). This skill is
about the *content* of the SI — what each part says, why it says that, and
how to change it without reopening a closed incident.

All facts below are verified against `app/lib/gemini.ts` (533 lines, read in
full), `documentation/architecture.md`, and `requirements/quality_improvements.md`
on branch `si-improvements` as of 2026-07-19 (commits through `9a0726c`). Line
numbers drift as the file changes — re-verify with the grep commands in
"Provenance and maintenance" before trusting them blindly. Where a doc
disagreed with the code, code won and the discrepancy is noted inline.

## When NOT to use this skill

| You actually need | Use instead |
|---|---|
| Whether a change is safe to merge, branch/PR/deploy process | `forms-restyler-change-control` |
| The full set of load-bearing invariants across the whole app (not just the SI) | `forms-restyler-architecture-contract` |
| Debugging a live symptom (stuck timeline, CORS error, wedged dev server) | `forms-restyler-debugging-playbook` |
| Full incident post-mortems (INC-1…INC-20) | `forms-restyler-failure-archaeology` |
| The question-text-drift elimination plan itself (not just "it exists") | `forms-restyler-drift-elimination-campaign` |
| Running the eval pipeline / A-B comparing SI versions | `forms-restyler-eval-pipeline`, `forms-restyler-validation-and-qa` |
| Google Forms' internal data format (`FB_PUBLIC_LOAD_DATA_`) | `google-forms-internals-reference` |
| Image-model IDs, flags, env vars | `forms-restyler-config-and-flags`, `forms-restyler-build-and-env` |

---

## 1. SI anatomy — how `buildSystemPrompt()` assembles the prompt

`buildSystemPrompt(structure, submitUrl, includeImages)` (`app/lib/gemini.ts`
lines 119-192) returns one big string, built in this fixed order:

| Order | Section | Lines (approx.) | Content |
|---|---|---|---|
| 1 | Persona + task framing | 120-122 | "You are an expert frontend developer…" — sets the output contract (complete, self-contained HTML page) |
| 2 | CRITICAL preamble | 124-129 | Unnumbered prose block, stated *before* the numbered rules even start: never change title/description/question text/type/options; styling and layout only |
| 3 | Numbered rules 1-18 | 132-169 | The core rule list — see §1.1 below |
| 4 | Conditional image guidelines | 170-180 | `includeImages ? <image guidance block> : <"no images at all" block>` — mutually exclusive, selected by a ternary on the `includeImages` flag |
| 5 | Form structure JSON | 182-183 | `JSON.stringify(structure, null, 2)` — the entire scraped `FormStructure`, verbatim |
| 6 | Per-question type reminder | 185-187 | A generated summary line per question ("N. "text" → type: X (render as …)") — a second, redundant statement of each question's type, directly after the raw JSON |
| 7 | Closing "announce your plan first" reminder | 189-191 | Restates the `announce_plan`-first requirement and, a third time in the whole SI, that text content is read-only |

Two things worth internalizing about this shape:

- **The verbatim-content instruction is repeated at least three separate
  structural positions** — the CRITICAL preamble (step 2), inline inside
  rules 1/7/8/10, and the closing reminder (step 7) — rather than stated once
  and trusted. This redundancy is deliberate prompt-engineering practice, not
  padding; see §7.
- **The form structure JSON (step 5) is interpolated raw**, not summarized or
  paraphrased by the SI-building code — the model sees the exact same
  `structure` object the rest of the app operates on, so there is no
  transcription step where the harness itself could introduce drift. Step 6
  exists purely to reduce the chance Gemini misreads a `type` field buried in
  a large JSON blob — it does not add new information, it just repeats the
  most error-prone field (type) in a terser, more scannable form.

`buildSystemPrompt()` is called once per `generateForm()` invocation (line
234) — the whole SI, including the footer HTML and the interpolated
structure JSON, is rebuilt fresh on every single turn of a conversation
(initial generation and every iterative edit), not cached or diffed.

### 1.1 Rule-by-rule map

For each rule: what it enforces, why it exists (rubric dimension from
`evals/rater_instructions.md` — Dim 1 Functionality, Dim 2 Groundedness,
Dim 3 Completeness/instruction-following, Dim 4 Visual aesthetics — and/or
the incident that produced it), and the concrete regression you get if you
weaken or delete it.

| # | Enforces | Why (dimension / incident) | If weakened |
|---|---|---|---|
| 1 | Output is raw HTML only, first char `<`, last char `>` — no markdown/fences/prose | Dim 1 — the output is inserted directly as the published page (`GET /f/{id}`) and as iframe `srcDoc`; there is no rendering step that would tolerate markdown fences | Code fences or preamble text render as literal visible text, or break `srcDoc` parsing. **Not fully trusted even today:** `generateForm()` strips ```` ```html ```` fences from the response as a safety net (lines 513-517) — proof that rule 1 alone is not a hard guarantee, only a strong prior |
| 2 | All CSS inline in `<style>` in `<head>`, no external stylesheets | Dim 1 — the generated page is served frozen from Redis with no build step and no CDN of its own; `srcDoc` documents have no natural base URL to resolve external assets against | Broken/missing styling once published or previewed, especially if the external URL later 404s |
| 3 | All JS inline in `<script>`, no external scripts | Dim 1 — same self-containment reason as rule 2; also the submit logic (rule 5) must run with zero network dependency besides the one fetch it's told to make | Submit logic silently fails to load; broken interactivity |
| 4 | Every input's `name` is the exact `entry.XXXXXXXXX` string from the structure | Dim 1 + Dim 2 — the submit proxy (`/api/submit/[formId]`) forwards these keys verbatim to Google's `formResponse` endpoint, which routes by entry id to the owner's Sheet columns | Responses silently vanish or land in the wrong Sheet column — the rubric's #1 failure mode and the product's core promise broken |
| 5 | `fetch` POST to `${submitUrl}`; JSON body keyed by entry name; checkbox values as arrays; multi-step forms collect ALL step values before submitting | Dim 1 — `submitUrl` is baked per-request from the generating origin (see `app/app/api/generate/route.ts`); a wrong body shape or a premature submit before later steps are filled loses data | Submissions POST to the wrong shape/URL, or a multi-step form submits with earlier answers missing |
| 6 | Mobile responsiveness: no fixed px widths on the main container; ≥16px text on mobile *except* secondary/helper text and the rule-18 footer; 16-24px horizontal padding ≤480px; content-sized cards/steps (no fixed heights / min-height / space-between stretch) | Dim 4 — **INC-7**, a multi-hour mobile bug hunt with FOUR independent root causes (em-inherited footer sizing, the 16px minimum wrongly applied to secondary/footer text, fixed desktop padding not compressing, and stretch-to-fill step containers). This rule is the fix for 3 of those 4 causes; the 4th (footer em-inheritance) is fixed separately in rule 18 + `buildGoogleFormsFooter` (§2) | Any one of the INC-7 symptoms can return in isolation: huge footer text (if the exemption clause is dropped), un-compressed padding leaving dead white space on phones, or stretched cards with a big gap above the Next button |
| 7 | Render every question from the structure, in order; always show title + description | Dim 2 — completeness; corresponds to QI-4 validator check #9 ("no question missing") | A dropped question breaks the response schema and is an automatic groundedness failure |
| 8 | Required-field validation only when `required: true` in the structure; optional fields must stay optional (no added asterisks/attributes) | Dim 1 + Dim 2 — QI-4 check #6 | Over-validating optional fields blocks legitimate submissions; under-validating required ones lets required data through blank |
| 9 | `linear_scale`: single horizontal row of numbered radio buttons, min/max labels aligned under the endpoints; on narrow screens compress evenly (~40px min touch target) or scroll — never overflow or clip | Dim 4 — the rubric's named "Improper Scaling for narrow screens" failure. **QI-11 note:** the original rule ("single row, never stack") conflicted with rule 6's general responsiveness on narrow phones; the narrow-screen clause was *amended into this same rule* rather than added as a new numbered rule — see §7 on why | Either the scale overflows/clips on mobile, or (if the "never stack" half is dropped) reverts to a vertically-stacked layout that was explicitly designed against |
| 10 | Multi-step review page shows the actual entered values, never placeholder text like "No answer provided" | Dim 1 + Dim 2 — a respondent must be able to verify what they are about to submit | Respondents submit blind, unable to catch their own mistakes before the irreversible submit |
| 11 | Page fills the full viewport (`min-height: 100vh`) with a chosen background colour — never plain white/transparent. Explicitly scoped: "applies to the PAGE background only — not to the form card" (this scoping clause lives inside rule 6's text, not rule 11's — a deliberate forward-reference to prevent rule 6 and rule 11 from being read as contradictory) | Dim 4 — named rubric failure "plain white"/"Distracting Backgrounds" | Unfinished-looking plain-white pages, or (if the page/card scoping note is lost) reintroduces the INC-7-style confusion between page background and card sizing |
| 12 | Visual distinction: radio = round indicator, checkbox = square + "Select all that apply" helper text, never visually identical; every selectable option has a visible selected state (filled + background/border change), hover state, and keyboard-focus state | Dim 1 — named rubric failure "Visual feedback on selecting answer options" (QI-5). Added/strengthened in commit `d0b8c13` after observing radio/checkbox visual ambiguity in generated forms | Respondents can't tell single-select from multi-select by looking at it, or can't tell whether their click registered |
| 13 | Layout choice: follow an explicitly/implicitly specified layout (prompt or style guide) exactly; if none is specified, choose freely but never mix layouts within one form; **preserve the existing layout across iterative edits unless the new prompt asks to change it** | Dim 3 — named rubric failure "Wrong Output Format" (QI-7). The "preserve across edits" clause exists so a follow-up prompt that only asks for a colour tweak doesn't also flip the whole form from single-page to multi-step | Without the preserve-across-edits clause, small iterative requests can trigger a full unrequested layout rewrite — a real regression pattern this clause was written to close |
| 14 | Question-by-question layout sub-rules (a-f) — see below | Dim 1 — multi-step navigation correctness. Revised in `d0b8c13` | See per-sub-rule notes below |
| 14a | Final step MUST always be a review page — no exceptions | Dim 1 + Dim 2 — lets respondents verify before submit (feeds rule 10) | Respondents can submit without ever seeing a summary of their answers |
| 14b | Single-select steps (multiple_choice/dropdown/linear_scale) may auto-advance on selection, but a Next button must ALSO be present | Dim 1 — `d0b8c13` revision; auto-advance-only would strand anyone who wants to change their answer or navigate deliberately before moving on | Auto-advance with no manual override traps the user on a wrong answer they can't reconsider before it's too late |
| 14c | Multi-input steps (checkboxes, short_answer, paragraph, date, time) never auto-advance | Dim 1 — there is no single unambiguous "done" signal for free text/multi-select, so premature auto-advance would cut off input mid-entry | Text gets cut off before the user finishes typing |
| 14d | Every step but the first has a Back button; review page has one too | Dim 1 — standard multi-step UX; without it, earlier answers are uncorrectable | Users stuck unable to fix an earlier answer |
| 14e | Clicking Next on an unanswered required question shows a validation message and does not advance; optional questions may be skipped freely | Dim 2 — mirrors rule 8, ensures required data is actually collected | Required data silently missing from the submission |
| 14f | Enter key advances the step (same validation as Next), *except* inside a `<textarea>` where it must insert a line break instead | Dim 1 — the textarea exception prevents Enter inside a multi-line paragraph answer from prematurely advancing/submitting — a common, easy-to-miss usability bug in generated multi-step forms | Users writing a paragraph answer get bumped to the next step mid-sentence every time they press Enter for a new line |
| 15 | Placeholders limited to generic text ("Your answer") or a neutral format hint (e.g. "DD/MM/YYYY") — never themed/decorative/invented copy | Dim 2 (minor) — QI-3. Before this rule, the model freely invented themed placeholders (e.g. "Tell us your magical name!") that read as fabricated form content | Whimsical/invented placeholder text reads as content drift even though it's not technically the question text |
| 16 | ~WCAG AA contrast (4.5:1 body, 3:1 large headings) against actual rendered background; overlay/text-shadow required over images/gradients; explicitly includes the footer notices | Dim 4 — named rubric failures "Hard to Read (Bad Contrast)" / "Distracting Backgrounds" (QI-9) | Illegible text over generated images, gradients, or coloured cards — a top visual failure mode |
| 17 | Never clip/overflow text; `overflow-wrap`; no fixed-height text containers; scrollable regions show a scrollbar; check against the longest question/option text | Dim 4 — QI-10, described in the requirement doc as a "low-cost, high-frequency failure class" | Long questions or option labels get cut off or overlap other content |
| 18 | Google Forms footer, interpolated verbatim from `buildGoogleFormsFooter(structure.formId)` — see §2 for the full treatment | Dim 2 — **INC-8**: early generations showed a wrong Google-Forms glyph and dropped the required legal links; this was a *guaranteed* rubric failure before the fix (the rubric explicitly names "Missing Google Forms logo" and "Missing notices" as failure modes) | Legal notices/links disappear (guaranteed groundedness failure), or the grey text wordmark gets replaced by an icon/logo image (a separately named rubric failure) |

### 1.2 The conditional image block (step 4 above)

`buildSystemPrompt` branches on `includeImages` (lines 170-180):

- **`includeImages` true:** "IMAGE GENERATION GUIDELINES" — when to decide
  images help (event/branded/themed forms) vs. not (simple surveys, internal
  forms); prompt-writing guidance (style/mood/composition, never request
  text/words/letters in an image); allows multiple `generate_image` calls;
  instructs Gemini to use the actual returned image colors for complementary
  form colors; per-image-type placement guidance (background = CSS
  `background-image` + overlay, header = top banner 200-300px, accent = sized
  to support without overwhelming).
- **`includeImages` false:** "IMAGE RULES" — no `<img>` tags, no
  `background-image`, no external image URLs at all; styling must be colors/
  gradients/CSS only. Explicitly carves out an exception: "(The text-based
  Google Forms footer required by rule 18 is unaffected by this rule.)" —
  without that carve-out, a model told "no images at all" could plausibly
  interpret the footer wordmark as an image and drop or mis-render it.

Zero-image outcomes are an intended product behaviour, not a bug: even with
`includeImages` true, the SI explicitly tells Gemini plain surveys don't
need images, and it is allowed to call `generate_image` zero times.

---

## 2. `buildGoogleFormsFooter(formId)` — the canonical footer

```ts
// app/lib/gemini.ts, lines 109-117
function buildGoogleFormsFooter(formId: string): string {
  const formUrl = `https://docs.google.com/forms/d/e/${formId}/viewform`;
  return `<footer data-gforms-footer style="font-size:12px;line-height:1.8;...">
  <div>Never submit passwords through Google Forms.</div>
  <div>This content is neither created nor endorsed by Google. - <a href="${formUrl}">Contact form owner</a> - ...</div>
  <div>Does this form look suspicious? <a href="https://docs.google.com/forms/d/e/${formId}/abuse">Report</a></div>
  <div aria-label="Google Forms" style="font-size:20px;color:#5f6368;margin-top:14px;">
    <span style="font-weight:500;">Google</span> <span style="font-weight:400;">Forms</span>
  </div>
</footer>`;
}
```

**Why the footer is generated HTML interpolated verbatim, not a prose
instruction.** An earlier design would have described the footer in the SI
("include the standard Google Forms notices and a Terms/Privacy/Report
footer with a Google Forms wordmark") and let the model write the HTML.
Models paraphrase free text — link labels, exact notice wording, and exact
URLs would drift generation to generation, and the eval rubric checks for
*exact* notice text and exact URLs (`policies.google.com/terms`,
`policies.google.com/privacy`, the `/abuse` path). Interpolating the actual
markup and instructing "copied EXACTLY as given below... NEVER change the
notice text, the link labels, the link URLs, or the 'Google Forms' wordmark"
(rule 18) turns an open-ended *generation* task into a bounded *copy* task —
something LLMs execute far more reliably than free composition. This is the
single clearest example in this codebase of the general lesson in §7:
**prefer interpolating a canonical artifact over describing it in prose.**

**Fixed-px sizing exemption from rule 6 (the em-inheritance bug, INC-7).**
Rule 6 sets a ≥16px mobile minimum for question/option/input text, but the
footer notices are 12px and the wordmark is 20px — both deliberately outside
that range. Rule 6 itself carves out the exemption ("secondary text like
helper hints and the rule-18 footer is exempt and should stay small"), and
rule 18 repeats it with the concrete numbers: "Keep the footer's inline font
sizes exactly as given (12px notices, 20px wordmark) on ALL screen sizes...
Do not scale it up, and do not let it inherit the page's display font."

That last clause exists because of a real bug: the footer wordmark
originally used **em-based sizing**, which inherits the ambient font-size
scale of whatever element contains it. When a generated page set a larger
base/display font size for its overall theme (e.g. a "playful" display
font look), the em-sized footer wordmark scaled up with it — on some mobile
generations this produced a footer with comically oversized text, one of
the four independent causes bundled into INC-7. The fix was to switch the
footer to **fixed inline px values** (an absolute unit that does not
inherit ambient font-size) and to instruct the model explicitly never to let
it inherit the page's display font. This is the second lesson from this
incident: **size/layout rules must state which elements they apply to and
which are exempt** — a blanket "≥16px on mobile, always" rule is exactly
what caused the footer to need protecting from rule 6 in the first place
before the exemption existed.

**The `data-gforms-footer` marker.** The `<footer>` element carries a
`data-gforms-footer` attribute. As of 2026-07-19 this attribute is
**decorative only** — nothing in the runtime reads it; `app/lib/validate-form.ts`
does not exist yet (`find app/lib -iname "*validate*"` returns nothing). It
is reserved for the QI-4/QI-6 post-generation validator
(`requirements/quality_improvements.md`, status "Not started" as of
2026-07-18) so that a future deterministic check can assert the footer is
present without doing fuzzy text matching. Don't remove the attribute even
though nothing consumes it yet — it's cheap groundwork for the highest-value
item in the drift-elimination campaign (see §5).

---

## 3. Function-calling flow, exactly as implemented

Two function declarations are defined: `announcePlanFunctionDecl` (lines
88-103) and `generateImageFunctionDecl` (lines 53-85). The tools array
always includes `announce_plan`; `generate_image` is included only when
`includeImages && imageGenerator` (lines 228-232) — there is **no explicit
`toolConfig`/`FunctionCallingMode` setting anywhere in the file**, so
function-calling runs in the Gemini SDK's default **AUTO** mode: Gemini
decides for itself whether/how many times to call `generate_image` (zero,
one, or many) based on the SI's guidance in §1.2, not because the harness
forces a call.

**`announce_plan` is a soft-mandatory-first, backed by a hard fallback —
not an enforced constraint.** The SI text says Gemini "MUST call this
function first, before generating any HTML or calling generate_image" (line
91), and the closing reminder repeats "Always call announce_plan as your
very first action" (line 190). But this is prompt-only; the SDK cannot force
it. Two pieces of code compensate for that gap:
- When Gemini's response contains multiple function calls in one turn, they
  are re-sorted so any `announce_plan` call is processed first regardless of
  the order Gemini emitted them (lines 354-360).
- If `announce_plan` is *never* called across the whole generation, the code
  detects this after the function-calling loop ends (`announcePlanCalled`
  stays `false`) and synthesizes a fallback `plan` progress event with a
  generic detail string ("Generating form based on your request", lines
  504-506) — so the UI timeline always shows a plan step even when the model
  didn't cooperate. This is a concrete instance of the "compensate for a
  prompt-only guarantee in code" pattern — treat it as the template when a
  future SI instruction similarly can't be enforced by the SDK itself.

**The functionResponse / vision split (INC-16).** Within one loop iteration
(lines 330-501), all function calls Gemini made in that turn are processed
and split into two separate arrays:
- `functionResponses` — one `functionResponse` Part per call (`announce_plan`
  gets `{ success: true }`; `generate_image` gets `{ url, imageType, success }`
  on success or `{ success: false, error }` on failure).
- `visionFollowUp` — for each successfully generated image, an `inlineData`
  Part (the actual image bytes) plus a text Part telling Gemini the image's
  CDN URL and to use it for color matching.

These are sent as **two separate `chat.sendMessage()` calls**: first
`functionResponses` alone (line 492), then, only if non-empty,
`visionFollowUp` alone (line 498), wrapped in `color_match`
started/completed progress events (lines 497, 499). The code comment states
the reason directly: `// functionResponse goes in first message (cannot mix
with other types)` (line 440) — the Gemini SDK does not allow a message to
mix a `functionResponse` part with other part types (vision `inlineData` or
plain text). Sending both together is a client-side error, not a modeling
choice; do not "simplify" this into one message.

**Progress callback → SSE events.** `generateForm()` accepts an optional
`onProgress: (event: ProgressEvent) => void` callback (the `ProgressEvent`
shape is `{ type: "step", step, status, detail?, imageType?, imageIndex?,
imageCount? }`, lines 42-50). It fires at: `analyze` started/completed
(lines 319, 322 — wraps the very first `sendMessage`), `plan` completed
(line 389, or the fallback at 505), `image_gen` started/completed/failed per
image (lines 406-414, 431-438, 466-474, with `imageIndex`/`imageCount` for
multi-image batches), `color_match` started/completed (497, 499), and
`html_gen` started/completed (509, 530). `app/app/api/generate/route.ts`
passes a function that turns each callback into an SSE `data: {json}\n\n`
line consumed live by `ChatPanel.tsx`'s `TimelineMessage` — see
`documentation/architecture.md`'s SSE event table for the wire format; this
skill only covers where in `gemini.ts` each event actually fires.

---

## 4. Style-guide handling

When a `styleGuide` is passed to `generateForm()`, its image is pushed as an
`inlineData` Part followed by a text Part (lines 268-281). The exact text,
verbatim from the code:

> "The image above is a visual style guide. Deliberately extract and apply
> its visual language: colour palette (dominant + accent colours), typography
> feel (serif/sans, weight, formality), spacing and density, corner radius
> and border treatment, and overall mood.\[Focus specifically on: {focusNote}.]
> If the creator's request asks to follow this image's layout, replicate its
> layout/structure as closely as the form content allows; otherwise use it
> only as a visual style reference and do not clone its layout. Never embed
> this image itself in the form."

Two behaviours to hold onto:

- **Layout is NOT cloned by default.** The default behaviour is "visual
  style reference only" — palette/typography/spacing/corners/mood, not
  structure. This is deliberate (QI-8's product decision): a style guide
  screenshot of, say, a magazine layout should not force the generated form
  into a magazine layout unless asked.
  - **Extraction checklist:** palette (dominant + accent), typography feel
    (serif/sans, weight, formality), spacing/density, corner radius/border
    treatment, overall mood — five explicit dimensions, not a vague "match
    the vibe" instruction.
  - **The optional `focusNote`** (from `StyleGuideDialog.tsx`'s "focus on"
    field) is appended only when non-empty and narrows which of those five
    dimensions to prioritize.
- **Layout IS replicated when the creator's prompt asks for it** — the exact
  trigger is "if the creator's request asks to follow this image's layout."
  This is a conditional carve-out of rule 13 (§1.1): a layout implied by the
  style guide *plus* an explicit user ask counts as "specified" under rule
  13 and must then be followed exactly.
- This text lives in the **per-message user-turn text**, not the SI/system
  instruction — because it only applies on turns where a style guide is
  actually attached, and folding a conditional feature into the (already
  long) SI would grow it for every generation, including the ones with no
  style guide. Keep this distinction when deciding where to add new
  conditional guidance: SI = every turn, per-message text = this turn only.

---

## 5. Known limitation: question-text drift (INC-9, OPEN)

Despite rules 1/7/8/10, the CRITICAL preamble, and the closing reminder all
independently restating "content is read-only," Gemini occasionally
paraphrases question text or option labels — e.g. "Rate your current
baking/decorating experience." rendered as "Rate your current experience."
It is non-deterministic and infrequent; a retry of the same generation
usually produces correct output.

Commit `f5599da` ("Fix form content rewriting: strengthen prompt to preserve
question text verbatim") is the one prompt-only attempt on record: it
reinforced immutability language in the `announce_plan` function
description, its parameter docs, and the SI's closing reminder (a 5-line
insertion). It **reduced but did not eliminate** the drift —
`documentation/architecture.md`'s "Known limitation" section and
`requirements/quality_improvements.md`'s QI-4 problem statement both say so
explicitly ("Prompt language has plateaued").

**Treat further prompt-only fixes to this specific problem as a known-weak
path**, not a place to spend more SI-engineering effort — the drift is
described as *non-deterministic*, and non-deterministic failures cannot be
prompted away with stronger wording; you would be repeating an experiment
already run once with diminishing returns. The accepted structural fix is
the QI-4/QI-6 post-generation validator (parse the generated HTML, diff
question/option text and `entry.*` names against `structure.questions[]`,
auto-retry or auto-correct on mismatch) — status "Not started" as of
2026-07-18, and the target of the hardest-live-problem campaign. See
**forms-restyler-drift-elimination-campaign** for the campaign plan and
solution ranking; this skill's job stops at "don't re-attempt the
already-tried prompt-only fix."

---

## 6. How to change the SI safely — checklist

Full merge gates and sign-off requirements live in
**forms-restyler-change-control** §4 (the SI change protocol) — this is the
compact, SI-specific version to run through while actually editing rule
text:

1. **Batch related changes into one revision**, don't dribble single-rule
   edits. Precedent: commit `9a0726c` landed the footer, layout guidance,
   and mobile/legibility rules together as "Batched SI revision," because a
   long rule list edited piecemeal both worsens instruction drift and
   prevents a clean before/after eval comparison.
2. **Write or update a QI-style requirement first**
   (`requirements/quality_improvements.md` or a successor doc): problem →
   rubric linkage → requirement → how to address, tagged `[SI]` or
   `[Structural]`, with a dated status table. QI-1…QI-11 are the template to
   copy.
3. **Never touch the verbatim-content rules** (the CRITICAL preamble, rules
   1/4/7/8/10, the closing reminder) to make them *weaker or shorter* — they
   guard the product's core promise (DR-3 in change-control) and are already
   fighting an open, unsolved drift problem (§5). Strengthening their
   wording is a known-weak path (§5); loosening them is strictly worse.
4. **Live-test on the dev server**, including a **narrow mobile viewport**
   — not just desktop. INC-7 was a multi-hour hunt precisely because a
   mobile-only regression sat unnoticed; any rule 6/9/11/18 edit must be
   screenshotted at ≤480px before it's considered done.
5. **Run the eval A/B** on the 37-item eval set (generate old-SI vs. new-SI
   output, rate against `evals/rater_instructions.md`) before merging —
   never merge an SI change on the strength of one good-looking generation
   (SI failures are probabilistic, not deterministic).
6. **Update `documentation/architecture.md`'s "System prompt rules
   enforced" section** to match the new rule numbering/text — it is the doc
   of record and goes stale the moment a rule is renumbered or reworded.
7. **Commit message names the specific behavioural rule that changed**, not
   "tweak prompt" — e.g. "New rule 12: radio buttons must render round
   indicators, checkboxes square…" (from `d0b8c13`). Prompt text is code;
   commit messages are its changelog.
8. **Merge to main only after validation** — main is prod
   (`forms-restyler-change-control` DR-5); an unvalidated SI change deploys
   to every real user on merge, with no separate release step.

---

## 7. Lessons in rule-writing craft, learned the hard way here

- **Scope every size/layout rule explicitly: which elements it applies to,
  and which are exempt.** Rule 6's mobile-text minimum names its own
  exemption inline ("secondary text like helper hints and the rule-18
  footer is exempt") rather than leaving it as an unstated special case —
  because the unstated version is exactly what caused the footer to inherit
  a blanket 16px minimum it was never meant to have, contributing to INC-7.
  Rule 11 (full-viewport background) gets the same treatment from the
  *other* rule that could conflict with it: rule 6 contains a forward
  reference clarifying "(Rule 11's full-viewport background applies to the
  PAGE background only — not to the form card)." When two rules could
  plausibly be read as governing the same element, say so explicitly in at
  least one of them.
- **Prefer an interpolated canonical artifact over a prose description**
  whenever the rubric checks something exactly (§2). The footer is the
  clean example: describing it in words invites paraphrase; handing the
  model real markup and saying "copy this" does not. Apply this test before
  writing a new content-fidelity rule: is there a canonical string/HTML
  fragment you could generate in code and interpolate, instead of asking
  the model to compose it from a description?
- **State both the positive rule and its anti-pattern explicitly**, not just
  one direction. This project's rules consistently pair "do X" with an
  explicit "never Y": rule 9 ("single row... never stack them vertically...
  never overflow the viewport or clip"), rule 12 ("these two types must
  NEVER look the same"), rule 15 ("never invent themed, decorative, or
  question-specific placeholder copy"), rule 18 ("NEVER change the notice
  text... never replace it with an icon, logo image, or SVG"). The negative
  half closes off the most likely wrong interpretation the model might
  otherwise default to.
- **Put hard, machine-checkable constraints early; put subjective/aesthetic
  ones late.** Rule 1 (output format: raw HTML, first/last char) and rule 4
  (exact `entry.*` names) are the first things stated after the CRITICAL
  preamble — both catastrophic and unambiguous if violated. Contrast (16)
  and overflow (17), which are comparatively soft/judgment-based, sit near
  the end. Ordering isn't cosmetic here: it front-loads the constraints
  whose violation is most costly and easiest for the model to get
  unambiguously right.
- **When a rule needs new behaviour that only applies in a narrower
  condition (e.g. "on narrow screens"), amend the existing rule in place
  rather than adding a new numbered rule for the same concern** — rule 9's
  narrow-screen clause was appended to the existing linear-scale rule
  (QI-11), specifically because `requirements/quality_improvements.md`
  flags that the rule list is already long and long rule lists themselves
  contribute to instruction drift. A new standalone rule 19 for "linear
  scale on narrow screens" would have fragmented one concern across two
  rules for no benefit.

---

## Provenance and maintenance

Written 2026-07-19, branch `si-improvements` (commits through `9a0726c`,
6 commits ahead of `main`; **not merged**, so `main`/prod still runs the
pre-`si-improvements` SI — verify with `git log main..si-improvements
--oneline`). Sources: `app/lib/gemini.ts` (read in full, 533 lines),
`documentation/architecture.md` (`lib/gemini.ts` section), and
`requirements/quality_improvements.md` (QI-1…QI-11, implementation-status
table dated 2026-07-18), cross-checked against `git show --stat` for commits
`f5599da`, `d0b8c13`, `9a0726c`, and a direct `find`/`grep` confirming
`app/lib/validate-form.ts` does not yet exist and no `toolConfig`/
`FunctionCallingMode` is set in `gemini.ts`.

Re-verify volatile claims before relying on them:

| Claim | Re-verify with |
|---|---|
| Current rule count is 18 | `grep -c '^[0-9]\+\.' app/lib/gemini.ts` (counts top-level numbered rule lines only — sub-rules like 14a-f don't match) |
| `data-gforms-footer` still unused by runtime code | `grep -rn "data-gforms-footer" app --include="*.ts" --include="*.tsx"` (only `gemini.ts` itself should match) |
| QI-4/QI-6 validator still not built | `find app/lib -iname "*validate*"` (expect no results) and `grep -n "QI-4" requirements/quality_improvements.md` |
| Function calling still implicit AUTO mode (no explicit toolConfig) | `grep -n "toolConfig\|FunctionCallingMode" app/lib/gemini.ts` (expect no matches) |
| Text model still `gemini-3-flash-preview` | `grep -n "MODEL_ID" app/lib/gemini.ts` |
| f5599da is still the only prompt-only drift fix attempt | `git log --oneline --all -- app/lib/gemini.ts \| grep -i "verbatim\|drift\|content"` |
| `si-improvements` still unmerged / commit range | `git log main..si-improvements --oneline` |
