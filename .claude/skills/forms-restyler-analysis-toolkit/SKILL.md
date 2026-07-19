---
name: forms-restyler-analysis-toolkit
description: Load when you need to MEASURE something about a generated (restyled) Google Form instead of eyeballing it — question/option/title text drift against the source Google Form, submit-wiring correctness (POST target, checkbox arrays), or WCAG color contrast of inline CSS. Triggers — "check for drift", "did Gemini paraphrase this", "verify entry IDs are present", "does this submit to the right form", "check contrast", "is this text readable", "measure quality instead of eyeballing", "check-drift.mjs", "run the drift checker", "compare generated form to the Google Form".
---

# Forms AI Restyler — Analysis Toolkit

"Measure, don't eyeball." Three scripts that turn a subjective "does this look
right?" into a scriptable OK/DRIFT/FAIL report, plus recipes for the parts
that genuinely can't be measured by a static script (rendering, live
submission). All scripts are plain Node (>=20), ESM, stdlib + global `fetch`
only — no `npm install` needed. Run every invocation below from the repo
root.

Ground truth for all three scripts, verified 2026-07-19 against real files in
this repo:
- `app/lib/scraper.ts` — the `FB_PUBLIC_LOAD_DATA_` bracket-depth walker and
  index map (`check-drift.mjs` is a faithful port of `normalise()`).
- `app/lib/gemini.ts` — `buildGoogleFormsFooter()` (the `data-gforms-footer`
  marker), `buildSystemPrompt()` rules 4–9, 12, 16, 18 (entry names,
  checkbox arrays, contrast, footer).
- `app/app/api/generate/route.ts` line ~61 — `submitUrl` construction
  (`${origin}/api/submit/${structure.formId}`).
- `app/app/api/submit/[formId]/route.ts` — the submit proxy.
- `app/app/f/[id]/route.ts` — `/f/{id}` serves the generated HTML verbatim
  (`Content-Type: text/html`), so any generated-form URL can be fetched
  directly with `curl`/`fetch`.

## When NOT to use this skill

- To FIX drift once you've found it — that's the drift-elimination campaign
  (`forms-restyler-drift-elimination-campaign`), which also owns the QI-4/QI-6
  validator design these scripts are prototypes for.
- To decide whether a change is "validated enough to merge" or to run a
  rubric-based A/B rating pass — that's `forms-restyler-validation-and-qa`.
- To triage a live bug (stuck generation, CORS error, publish failure) —
  that's `forms-restyler-debugging-playbook`.
- To look up what `FB_PUBLIC_LOAD_DATA_` fields mean in general, independent
  of these scripts — that's `google-forms-internals-reference`.
- To run the eval pipeline itself (generate the 68 restyled forms, rebuild
  the manifest) — that's `forms-restyler-eval-pipeline`. These scripts
  consume its output (`evals/manifest-items/*.json`) read-only.

---

## 1. `scripts/check-drift.mjs` — THE flagship: groundedness / drift checker

**Purpose:** cross-reference a generated form's HTML against the Google Form
it was scraped from. Reports every question, option, title, description,
entry ID, and footer marker that doesn't match, instead of a human scanning
both side by side.

**Invocation:**
```bash
node .claude/skills/forms-restyler-analysis-toolkit/scripts/check-drift.mjs \
  <generated-form-url-or-html-file> <google-form-responder-url>
```
`<generated-form-url-or-html-file>` accepts either a live `https://.../f/{id}`
URL or a local `.html` file path (e.g. a saved copy, or stdin redirected to a
file — the script does not read stdin directly, redirect to a temp file if
you need pipeline input).
`<google-form-responder-url>` must be a `.../forms/d/e/<id>/viewform` URL (the
public responder page, not the edit URL) — the form ID is parsed out of this
URL with the same regex as `scraper.ts`.

**Self-test (proves the checker isn't vacuous):**
```bash
node .claude/skills/forms-restyler-analysis-toolkit/scripts/check-drift.mjs --self-test
# or pin a specific pair:
node .claude/skills/forms-restyler-analysis-toolkit/scripts/check-drift.mjs --self-test \
  <generated-url> <responder-url>
```
This fetches a real pair, runs the checks once unmutated (informational
baseline — real drift may legitimately appear here), then appends
` §SELF-TEST-MUTATION§` to question 1's text IN MEMORY ONLY (nothing is
written to disk — this skill's scripts never mutate anything outside their
own process) and re-runs. It prints `SELF-TEST PASS` (exit 0) if that
specific check flips to DRIFT, `SELF-TEST FAIL` (exit 1) otherwise — a FAIL
here means the checker itself is broken, not that any real form has drift.

**What it checks (mirrors `app/lib/scraper.ts` `normalise()` exactly):**
| Source field | Path in `FB_PUBLIC_LOAD_DATA_` | Check |
|---|---|---|
| title | `raw[1][8]` | substring-present in generated text/attribute corpus |
| description | `raw[1][0]` | same (skipped as OK if the source form has none) |
| question text | `q[1]` | same, per question |
| entry ID | `q[4][0][0]` → `entry.<id>` | `name="entry.<id>"` present anywhere in the HTML |
| options | `q[4][0][1]`, each `o[0]` | same substring check, per option |
| required (WARN only) | `q[4][0][2] === 1` | best-effort: is `required` near that `name=` attribute — does NOT flip exit code |
| footer | n/a | literal `data-gforms-footer` substring present |

**Normalization applied to BOTH sides before comparing (documented exactly —
read this before trusting a DRIFT result):**
1. Decode `&amp; &lt; &gt; &quot; &apos; &#39; &nbsp;` (→ space) and numeric
   entities (`&#39;`, `&#x27;`, etc.).
2. Collapse all whitespace runs to a single space.
3. Trim.

NOT normalized: case, curly vs. straight quotes, dashes, punctuation. A
generated form rendering `Don't` as `Don't` (curly apostrophe) WILL show as
DRIFT — this is intentional; the SI's "character-for-character" rule makes
that a real (if cosmetic) violation, and the script is documenting drift as
found, not the drift you'd prefer to see.

**Interpretation:**
- `[OK]` — normalized string found verbatim in the generated HTML's text
  content or an attribute value (`value=`, `placeholder=`, `aria-label=`).
- `[DRIFT]` — not found. Exit code flips to 1 if any check is DRIFT.
- `[WARN]` — required-flag heuristic only; informational, doesn't fail the run.
- Exit 0 = no drift. Exit 1 = drift found, or a usage/fetch error.

**Limits (false positive / false negative modes — read before acting on a result):**
- *False positive DRIFT:* the corpus is a flat substring search across ALL
  text and attribute values on the page — it does not track which element a
  string came from. If a question's text is legitimately split across
  multiple DOM nodes with OTHER text injected between them (e.g. a numbered
  badge `<span>3</span>` sitting between two halves of a sentence in the raw
  HTML source order), the collapsed-whitespace substring won't match even
  though a human reading the rendered page sees it fine. Verify any DRIFT
  finding by opening the generated URL and reading the actual page before
  treating it as confirmed.
- *False negative DRIFT (a real problem NOT caught):* if drifted text happens
  to be a superset containing the original as a substring (rare, e.g.
  original "Name" drifted to "Full Name"), a naive substring search would
  still fail correctly here since we search for the ORIGINAL inside the
  GENERATED corpus, not the reverse — this direction is safe. But: if the
  SAME string appears elsewhere on the page (e.g. a repeated word in a
  review-page summary), a genuinely wrong entry-id assignment on the actual
  input could still show OK for "text present" while being wired to the
  wrong field — this script does not verify text-to-entry-id ASSOCIATION,
  only that both are present somewhere.
- Requires the source to be a live, public Google Form (the `.../viewform`
  page must still serve `FB_PUBLIC_LOAD_DATA_`). Does not work on Typeform/
  Fillout/Paperform source pages (see `thinExtraction` in the manifest —
  those never had exact ground truth to check against in the first place).
- Does not execute JavaScript or render the page — verbatim text that is
  injected client-side (e.g. templated from a JS array) is still caught
  because the corpus includes `<script>`... wait, no: `<script>` and
  `<style>` blocks are STRIPPED from the corpus before searching (so JS
  string literals like the `entryIds`/`questions` review-page arrays some
  generations use do NOT count as the text being "present" for drift
  purposes — only actual DOM-rendered text/attributes count, which is the
  correct standard since that's what a respondent actually sees).

**Verified 2026-07-19** against 3 real pairs from `evals/manifest-items/`:
- `atelier-eva-tattoo` (gemini-2.5-flash-image): 34 OK, **1 real DRIFT** — the
  generated description was paraphrased ("Start your tattoo request. Request
  a specific artist..." → "Request a specific artist or let us recommend the
  best fit for your project. Your journey starts here."), 1 WARN
  (required-flag heuristic, non-blocking).
- `barrys-lead-gen` (gemini-2.5-flash-image): 37 OK, **1 real DRIFT** — the
  generated title dropped the `: 2 Classes on Us` suffix (`"Barry's x NYC
  Wellness Guide: 2 Classes on Us"` → `"Barry's x NYC Wellness Guide"`).
- `colgate-oral-health-quiz` (gemini-2.5-flash-image): 64 OK, 0 DRIFT.
- `--self-test` (default pair, atelier-eva-tattoo): SELF-TEST PASS — planted
  mutation correctly flagged.

Both real DRIFT findings above are genuine content changes beyond the
documented question-text-drift limitation (INC-9) — they hit title and
description, which the SI's rule 1 ("Do NOT change the form title,
description...") also covers. Useful evidence for the drift-elimination
campaign that drift isn't confined to question text.

---

## 2. `scripts/check-submit-wiring.mjs` — static submit-path check

**Purpose:** confirm a generated form's submit code POSTs to the right
place, without needing a live submission.

**Invocation:**
```bash
node .claude/skills/forms-restyler-analysis-toolkit/scripts/check-submit-wiring.mjs \
  <generated-form-url-or-html-file> [expected-google-form-url-or-form-id]
```
The second argument is optional — omit it to just see what target was found;
pass it (a `.../viewform` URL or a bare form ID) to get a PASS/FAIL formId
comparison.

**What it checks:**
1. Finds every `/api/submit/<formId>` string inside `<script>` blocks
   (regex over the literal path, not JS execution).
2. If an expected form ID was given, compares it against what was found.
3. For every checkbox `name=` that has more than one `<input type="checkbox">`
   sharing it (i.e. a real multi-select question), heuristically checks
   whether the scripts contain array-sending evidence: `formData.getAll(...)`
   used near that entry name (`OK`), `getAll(` present somewhere but not
   provably tied to that name — e.g. a generic `entryNames.forEach(name => ...
   getAll(name))` loop, which IS correct code but isn't textually adjacent to
   the literal entry ID (`WARN` — inspect manually), or no `getAll` evidence
   at all (`DRIFT`).

**Interpretation:** `[OK]` / `[DRIFT]` / `[WARN]` / `[INFO]` per line; exit 0
only if nothing hit DRIFT.

**Limits — this is the most heuristic of the three scripts, be honest with
yourself about what a green result means:**
- It NEVER executes JavaScript. A `fetch('/api/submit/...')` call that is
  dead code (unreachable, inside a commented-out block the regex doesn't
  understand, or inside a function that's never called) still counts as
  "found."
- The checkbox-array check is regex-adjacency, not data-flow analysis. It
  cannot prove correctness, only find evidence FOR or find NO evidence
  (which is stronger — a true DRIFT here, no `getAll` anywhere despite
  multiple checkboxes sharing a name, means the code will silently keep only
  the LAST checked value when building a plain JS object from
  `formData.entries()`, a real bug pattern).
- Verified 2026-07-19: on `colgate-oral-health-quiz`'s generated HTML, the
  checkbox handling uses a generic
  `entryNames.forEach(name => { if (checkbox) payload[name] =
  formData.getAll(name) })` loop — genuinely correct, handles every checkbox
  question at once — but the script reports `WARN` for it (not `OK`) because
  the literal entry ID never sits next to the literal string `getAll`. This
  is the honest failure mode: **a WARN here is not evidence of a bug**, it
  means "this script's static heuristic ran out of confidence — read the
  code." Don't treat WARN as equivalent to DRIFT.
- Does not check that the submit fetch's response is actually handled
  correctly (success/error UI), only that the target and body shape look
  right.
- For a behavioral guarantee (not just "the code looks wired"), use the
  end-to-end submission recipe below — that's the only way to know for
  certain.

**Verified 2026-07-19** against 3 real generated URLs:
- `atelier-eva-tattoo` gemini-2.5-flash-image, with expected form ID: submit
  target found and matched, checkbox array handling `OK` (literal `getAll(`
  adjacent to the entry ID).
- Same generated URL, deliberately WRONG expected form ID: correctly reports
  `[DRIFT] formId match` and exits 1.
- `colgate-oral-health-quiz` gemini-2.5-flash-image, no expected arg: submit
  target found, `[INFO]` for the skipped formId check, `[WARN]` for the
  generic-loop checkbox handling described above (confirmed by manual `grep`
  to be genuinely correct code — a real example of the WARN-vs-DRIFT
  distinction holding up).

---

## 3. `scripts/contrast-check.mjs` — WCAG contrast of inline CSS

**Purpose:** compute WCAG relative-luminance contrast ratios for
`color`/`background-color` pairs declared in a generated form's inline
`<style>` block, instead of squinting at rendered text.

**Invocation:**
```bash
node .claude/skills/forms-restyler-analysis-toolkit/scripts/contrast-check.mjs \
  <generated-form-url-or-html-file>
```

**Interpretation (matches SI rule 16 / rater_instructions.md "Colors &
Contrast"):**
- Body text needs **>= 4.5:1**.
- Large text (headings) needs **>= 3:1**.
- The script prints the raw ratio and BOTH thresholds for every checkable
  rule — it cannot always tell from a bare CSS rule whether a selector is
  "large text" (that depends on the actual computed `font-size`, which
  requires more CSS resolution than this script does), so it labels ratios
  in the 3–4.5 range `WARN` ("passes for large text only") rather than
  guessing. You decide which threshold applies per selector by looking at
  what it styles.
- `[OK]` >= 4.5:1, `[WARN]` 3–4.5:1, `[FAIL]` < 3:1, `[UNCHECKABLE]` — could
  not resolve both sides to a solid RGB color.

**Scope — deliberately body/container-level only:** the script only looks at
rules whose selector is `body`, `html`, or contains one of `container`,
`wrapper`, `card`, `page`, `app`, `main`, `root`, `form`, `step`. It is not a
full-page audit of every button, badge, and link — per the assignment this
tool answers "is the base reading experience legible," not "audit every
pixel."

**How CSS variables are handled:** `var(--x)` is resolved against a `:root {
}` (or `html { }`) block if present, honoring `var(--x, fallback)` when the
variable itself is undefined. Resolution runs up to 3 passes for variables
that reference other variables.

**WHAT THIS SCRIPT CANNOT DO — say this out loud before trusting either a
green or a red result:**
- **Gradients and background images are NOT checkable statically.** Any rule
  whose background is a `linear-gradient(...)`/`radial-gradient(...)` or
  includes `url(...)` is reported `UNCHECKABLE`, never PASS/FAIL. Go look at
  it with your own eyes — see the mobile-viewport recipe below for the
  rendering setup; the same dev-server + browser approach applies to
  checking contrast over an image.
- **No real CSS cascade/specificity resolution.** If a rule sets `color` but
  not `background-color`, the script falls back to `body`'s
  `background-color` as an ASSUMED page background — labeled
  `[assumed page background ...]` in the output — which is a convenience
  heuristic for the single most common case, not a real cascade. A rule
  nested three levels under a `.card` with its own background will be
  silently checked against the WRONG (body) background if `.card`'s
  background isn't declared in the SAME rule block as the color.
- **Alpha is ignored** (treated as fully opaque). `rgba(192, 0, 0, 0.05)`
  (barely-there red) is scored as if it were solid `rgb(192, 0, 0)` — flagged
  inline as `(alpha ignored — real ratio may differ)`. The true rendered
  color is whatever that layer composites to against what's actually behind
  it, which this script cannot know statically.
- Only `#rgb[a]`, `#rrggbb[aa]`, `rgb()`/`rgba()`, and a small named-color set
  (white, black, red, green, blue, gray/grey, transparent) parse.
  `hsl()`/`oklch()`/etc. report `UNCHECKABLE`.

**Verified 2026-07-19** against 4 real generated URLs (and one real bug found
and fixed along the way):
- Initial run against `barrys-lead-gen` reported everything `UNCHECKABLE`
  ("unparseable") even though its `:root` block cleanly declared
  `--text-primary: #ffffff` etc. Root cause: the file opens with
  `@import url('https://fonts.googleapis.com/...');` before any rule — the
  original brace-depth scanner had no concept of a top-level
  `statement;` outside any block, so the `@import ...;` text got glued onto
  the following `:root` selector's buffer, and the combined string (starting
  with `@import`) was discarded as if it were an at-rule wrapper like
  `@media`. **Fixed**: the scanner now resets its buffer on any `;`
  encountered at stack depth 0. Re-run after the fix: `body` ratio
  21.00:1 OK, `.form-description` 7.37:1 OK.
- `atelier-eva-tattoo`: `body` 9.12:1 `OK`.
- `atelier-eva-tattoo` config B (gemini-3.1-flash-image-preview): 5 rules
  checked — 3 `OK`, 2 `WARN` (3.9:1–4.05:1 range — large-text-only, both on
  secondary/footer text using `--studio-secondary`).
- `colgate-oral-health-quiz`: **found a genuine, real FAIL** — `body` color
  `var(--text-main)` (`#202124`, near-black) on `var(--page-bg)` (`#9E0000`,
  dark red) computes to **1.88:1**, and `.form-description` to 1.41:1 — both
  well under even the 3:1 large-text floor. Confirmed by reading the raw
  `:root` declarations directly (not just trusting the script). This is real
  evidence for the drift-elimination / quality-improvement campaign that
  contrast rule 16 has live failures in the eval set, independent of the
  question-text-drift problem.

---

## 4. Recipes (no script — method + interpretation)

### Mobile-viewport verification (from INC-7)

Static analysis cannot see layout. To check mobile rendering:
1. `npm run dev` in `app/` (see `forms-restyler-run-and-operate` if the dev
   server won't start).
2. Open the generated form URL (local `/f/{id}` or the published
   `app-red-phi-88.vercel.app/f/{id}` URL) in a browser.
3. Open devtools, toggle device toolbar, set viewport to **375px** (iPhone
   SE/12/13 class) and then **320px** (smallest common width — iPhone SE 1st
   gen / small Android).
4. At each width, specifically check (these are the four independent things
   that were each wrong in INC-7 — check ALL FOUR, don't stop at the first
   one you find):
   - **Footer wordmark size** — must stay a fixed 20px, must NOT scale up
     with the page's display font. If it looks huge relative to the rest of
     the footer, that's rule 6's 16px-minimum leaking into secondary text.
   - **Footer notice text size** — must stay a fixed 12px, same failure mode.
   - **Horizontal padding** — should compress to 16–24px on screens
     <=480px, not reuse desktop padding values (a symptom is content that
     looks unnecessarily squeezed or has huge unused side margins).
   - **Container/step stretching** — step cards and containers must be
     content-sized, not stretched with `min-height`/`space-between` to fill
     the viewport (symptom: a big empty gap between the question and its
     "Next" button).
5. Also check for horizontal overflow/scroll at both widths (drag the
   viewport, or check if a horizontal scrollbar appears) — this is separate
   from the four INC-7 causes but is the other classic mobile failure mode
   (SI rule 17).

### A/B comparison method (same item, both image configs)

For one eval item, both `generated["gemini-2.5-flash-image"].url` and
`generated["gemini-3.1-flash-image-preview"].url` exist in its
`evals/manifest-items/<id>.json`. To compare:
1. Run `check-drift.mjs` against BOTH generated URLs (same responderUrl for
   both — it's the same source form).
2. Run `contrast-check.mjs` against both.
3. Open both side by side in a browser at both desktop and 375px widths.
4. Score dimension-by-dimension per `evals/rater_instructions.md` — do NOT
   form a single "which is better" gut impression; the rubric is
   stack-ranked (groundedness/submit-wiring first, then contrast/legibility,
   then everything else) — see `forms-restyler-validation-and-qa` for how
   ratings are supposed to be recorded and what counts as sufficient
   evidence to prefer one config.
5. Zero-image generations (5/34 items produce 0 images in BOTH configs —
   verified against `evals/manifest.json` 2026-07-19) are intentional — for those items A-vs-B measures
   generation variance, not image-model quality; don't read them as a config
   failure.

### End-to-end submission verification

The only way to get a real (not heuristic) answer to "does this actually
submit correctly":
1. Open the generated form (local or published) in a browser.
2. Fill it out with recognizable test values (e.g. prefix with `TEST-` so
   it's easy to find and ignore later).
3. Submit.
4. Open the corresponding Google Form's **edit** view → Responses tab (or
   the linked Google Sheet if one exists) and confirm the response appears
   with the correct values against the correct questions.
5. **The 37 eval Google Forms belong to the repo owner's personal Google
   account** (see `forms-restyler-eval-pipeline`) — you need access to that account to see
   the Responses tab for eval items. Don't create test-submission noise in
   forms you don't understand the ownership of; if you're not sure whose
   form it is, ask before submitting test data. For forms created via a
   throwaway `npm run dev` session against your OWN pasted Google Form URL,
   this is unrestricted.
6. Checkbox questions specifically: submit with 2+ options checked and
   confirm the response records ALL of them (not just the last one) — this
   is the live version of what `check-submit-wiring.mjs`'s checkbox
   heuristic can only guess at statically.

---

## 5. Worked example: INC-7, "enumerate all causes before patching one"

From the project's incident history (INC-7 in `forms-restyler-failure-archaeology`) —
the canonical case study for why this toolkit
exists instead of "fix it and eyeball it again."

**Symptom:** on narrow (mobile) screens, the generated form's footer text
rendered huge, and the form card had large unexplained white space.

**What did NOT happen:** the first plausible cause was not simply patched
and shipped. A multi-hour root-cause session found FOUR independent causes,
all real, all present simultaneously:
1. The footer wordmark used `em` sizing, so it inherited the page's display
   font scale (a decorative heading font intended for the form title, not
   12px body text).
2. SI rule 6's "text must be >=16px on mobile" minimum was being applied
   indiscriminately to the footer/secondary text, which is supposed to stay
   small.
3. Desktop padding/margin values were fixed pixel constants instead of
   compressing at narrow widths.
4. Step containers used `min-height`/`space-between` flex layouts that
   stretched to fill the viewport instead of sizing to content.

**Why this matters for how you use this toolkit:** if you'd fixed only cause
#1 (the most visually obvious one — the wordmark), the footer text would
shrink to a normal-looking size, you'd conclude "fixed," and ship — while
causes #2–4 remained, waiting to resurface on the next generation or the
next reviewer's phone. The fix that actually shipped (in `app/lib/gemini.ts`)
addressed all four: the canonical footer now uses fixed inline px sizes
(12px notices, 20px wordmark) and is explicitly exempted from rule 6; rule 6
itself gained a secondary-text exemption plus an explicit 16–24px mobile
padding range; containers/steps were changed to size to content.

**The transferable lesson, and how these scripts embody it:** "looks wrong"
is a single bit of information; it tells you nothing about HOW MANY
independent things are wrong or which one you're looking at. Before patching:
run the mobile-viewport recipe at BOTH 375px and 320px and write down every
distinct symptom you see (don't stop at the first). Where a script exists —
`check-drift.mjs` for content, `contrast-check.mjs` for color, this
recipe for layout — run it and record its FULL output, not just whether it's
green. The colgate contrast FAIL and the barrys/atelier drift findings above
were each single-symptom results from single scripts; INC-7 is the reminder
that a visual symptom can have several unrelated causes layered on top of
each other, and a script only tells you about the dimension it measures —
run all three (plus the recipes) before concluding a generation is "fine."

---

## Provenance and maintenance

Written 2026-07-19. All claims above were verified against the live repo and
live network requests on that date, not from memory:
- `app/lib/scraper.ts`, `app/lib/gemini.ts`,
  `app/app/api/generate/route.ts`, `app/app/api/submit/[formId]/route.ts`,
  `app/app/f/[id]/route.ts` — read directly.
- `evals/manifest-items/*.json` — read directly for real generated URLs and
  their source `responderUrl`s.
- All three scripts — executed against real, live `app-red-phi-88.vercel.app`
  URLs and live `docs.google.com/forms/.../viewform` pages (read-only GETs).
  Every ratio, drift finding, and bug-and-fix described above is copied from
  actual command output during authoring, not invented.

**Known time-bound facts:** the specific generated URLs cited above
(`/f/5aYZce4U-t`, `/f/GuktZaqRhd`, `/f/kokbmMvtHf`, `/f/OstP18C7y5`) are Blob
storage links with ~1-year TTL from generation (see each item's
`generated.<config>.expiresAt` in its manifest shard); they were reachable as
of 2026-07-19 and will eventually 404. The scripts themselves don't depend on
these specific URLs — they work on any `/f/{id}` URL or local HTML file — but
if you're trying to reproduce the exact numbers above and get a 404, pick a
fresh pair from `evals/manifest-items/*.json` (`.generated.<config>.url` +
`.form.responderUrl`) instead.

**Re-verification commands** (swap in a current URL pair from
`evals/manifest-items/` if the ones below have expired):
```bash
# Drift check against a real pair (replace with a live pair if this 404s):
node .claude/skills/forms-restyler-analysis-toolkit/scripts/check-drift.mjs \
  https://app-red-phi-88.vercel.app/f/5aYZce4U-t \
  https://docs.google.com/forms/d/e/1FAIpQLSdkD3Q8D_r3p152ZoXYh8ZgqDKMwKuRtNrEp2zKUPaYi8m6Xw/viewform

# Self-test (proves the checker catches planted drift; no fixed pair needed
# beyond the built-in default, which the script documents inline):
node .claude/skills/forms-restyler-analysis-toolkit/scripts/check-drift.mjs --self-test

# Submit-wiring check:
node .claude/skills/forms-restyler-analysis-toolkit/scripts/check-submit-wiring.mjs \
  https://app-red-phi-88.vercel.app/f/5aYZce4U-t \
  https://docs.google.com/forms/d/e/1FAIpQLSdkD3Q8D_r3p152ZoXYh8ZgqDKMwKuRtNrEp2zKUPaYi8m6Xw/viewform

# Contrast check (this is the one with a documented real regression-tested
# bug fix — re-running it is also a de facto regression test for the
# @import-before-:root parsing fix):
node .claude/skills/forms-restyler-analysis-toolkit/scripts/contrast-check.mjs \
  https://app-red-phi-88.vercel.app/f/GuktZaqRhd

# To pick a fresh pair from the manifest instead of the hardcoded ones above:
for f in evals/manifest-items/*.json; do
  python3 -c "
import json
d = json.load(open('$f'))
resp = d.get('form', {}).get('responderUrl')
for cfg, info in d.get('generated', {}).items():
    if info.get('status') == 'done':
        print(d['id'], cfg, info['url'], resp)
"
done
```
