# Eval Set Expansion — Requirements

Status: **Requirements agreed 2026-07-19. Pilot not started.**
Owner decisions in this doc were made by the project owner on 2026-07-19.

## Goal

Expand the eval set from the current 37 groundedness-oriented items to a set that
measures what the QI-4 validator cannot: **visual appeal, style adherence, and
instruction following** (rubric Dimensions 3 and 4). The post-generation validator
(`app/lib/validate-form.ts`) now deterministically guards groundedness and submit
wiring on every generation, so eval items no longer need to spend their budget on
what is checked automatically.

## Owner decisions (2026-07-19)

| Decision | Choice |
|---|---|
| Focus | Prompts, visual appeal, style adherence, instruction following |
| Question-type coverage | De-prioritized — common types in the base-form pool are sufficient |
| Multi-turn / refinement evals | Out of scope for this expansion |
| Explicit style-coherence pairing (same form, two style guides) | Dropped — coherence is implicitly tested because different items carry different style guides |
| Style guides | A MIX of form screenshots and **non-form brand images** (posters, packaging, brand pages) — real creators usually have a brand image, not a beautiful form |
| Layout specification | Some items must leave layout **unspecified** (tests SI rule 13 free choice) |
| Target size | ~60 new items, **pilot first** to test quality |
| Form-type style-guide sourcing pilot | 2 examples from each of the 4 sourcing tiers (8 total) |

## What makes a good eval item

An item is a triple **(base form, style guide, prompt)**.

1. **Visual appeal lives in the style guide.** The Google Form source is
   deliberately plain (it is the groundedness truth). "Visually appealing eval
   form" means a professionally designed, distinctive style guide.
2. **Distinctiveness is the bar.** Reject any style guide where a default-styled
   output could pass as "matching". Bland references cannot discriminate good
   output from lazy output.
3. **Coherence.** The form content must plausibly belong to the style guide's
   brand — the whole artifact makes sense together.
4. **Content realism.** 5–15 questions a real business would ask, mixed common
   types, correct required flags. (Satisfied by reusing existing base forms.)
5. **Prompts exercise instruction following** — see prompt bank below.

## Design

### Base forms: reuse, don't source

Reuse ~10 of the existing 37 recreated Google Forms (chosen for variety of
length and business vibe). **No new form scraping or recreation** — the
expansion's sourcing effort is pure image collection. This eliminates the
thin-extraction problem entirely and makes style-guide sources like designer
concepts usable (nothing needs to be scraped from them).

### Prompt bank (~5 classes + free-choice variant)

| # | Class | Example | Requires style guide |
|---|---|---|---|
| P1 | Simple/vague | "Make this form beautiful." | any/none |
| P2 | Specific layout requested | "One question per screen with a progress bar." | any/none |
| P3 | Guide's **layout**, new theme/palette | "Keep this reference's structure, but make it dark emerald." | form-type only |
| P4 | Guide's **palette/brand colors**, different layout | "Use the brand colors from this image; single-page card layout." | form or brand image (weighted to brand images) |
| P5 | No guide — layout + theme fully in text | "Single column, cream background, serif headings, terracotta accents." | none |
| P6 | Theme given, layout **unspecified** | "Warm, botanical, editorial feel." | none or brand image |

P3/P4 are the sharpest tests: they force the model to decompose a reference
into layout vs. color and follow only one half. Written prompts are reusable
assets, stored so items are reproducible.

**The authored bank lives in `evals/expansion/prompt-bank.json`** — 20 prompts
(`p1-1` … `p6-2`), each tagged with a `styleGuide` compatibility value:
`form` (needs a form-type screenshot), `brand` (needs a brand image), `none`
(must run without a guide), `any` (either kind), `optional` (with or without).
When assembling items, only pair a prompt with a guide kind its tag allows.

What each class tests, and the rules for authoring more prompts of that class:

- **P1 — simple/vague** ("Make this form beautiful."). Tests the model's
  default taste and its unforced use of an attached guide. Rule: no layout
  words, no color words — any styling the output shows is the model's choice.
- **P2 — specific layout requested** ("multi-step, one question per screen,
  progress bar at the top"). Tests layout instruction following. Rule: name a
  *checkable* structural fact (step count, progress bar, single scrollable
  column, conversational transitions) — a rater must be able to answer
  "did it comply?" yes/no. Say nothing about colors.
- **P3 — guide's layout, new theme** ("Keep this reference's structure, but
  make it dark emerald."). Tests reference decomposition: copy structure,
  discard palette. Rules: only valid with a *form-type* guide (brand images
  have no layout to copy); the named replacement theme must clearly clash
  with the guide's own palette, otherwise compliance is unjudgeable.
- **P4 — guide's palette, different layout** ("Use the brand colors from this
  image; single-page card layout."). The inverse decomposition: extract
  colors, ignore or invent structure. Rules: works with either guide kind but
  weight toward brand images; if the guide is form-type, explicitly forbid
  copying its layout (see `p4-3`) so the two halves can't both be satisfied
  by imitation.
- **P5 — no guide, fully specified in text** ("single column, cream
  background, serif headings, terracotta accents"). Tests pure text-to-design
  instruction following with no image to lean on. Rule: specify BOTH layout
  and theme concretely; every named attribute is a rating checkpoint.
- **P6 — theme mood given, layout unspecified** ("warm, botanical, editorial
  feel"). Tests SI rule 13's free layout choice plus mood interpretation.
  Rule: adjectives only — no structural or exact-color vocabulary; the rater
  judges mood fit and whether the freely-chosen layout is reasonable.

When extending the bank (e.g. for the scale-to-60 pass): keep ids sequential
within the class (`p2-5`, …), set the `styleGuide` tag honestly, and reuse
nouns a real creator would type — no design-theory jargon a Forms user would
never write.

### Style-guide inventory: two kinds

**Kind A — form-type (screenshot of a designed form/flow).** Sourced across
four tiers; the pilot takes **2 candidates from each tier**:

| Tier | Source | Character |
|---|---|---|
| T1 | UI-pattern libraries & designer showcases (Mobbin, Page Flows, Nicely Done; Dribbble/Behance form concepts) | Highest polish; concepts with fictional brands are acceptable — only the image matters |
| T2 | In-the-wild branded forms (Luma event pages, D2C product quizzes, startup waitlists, design-conscious application forms) | Most representative of real creator input |
| T3 | Competitor customer stories / showcases ("made with X", case studies) — NOT template galleries | Real branded forms; templates are the mediocre shelf and are avoided |
| T4 | Third-party "best form design" roundups | Pre-curated volume filler |

How to find each tier (starting URLs verified live 2026-07-19; the running
list is in `evals/expansion/candidates.md`):

- **T1:** browse https://muz.li/inspiration/forms/ and Eleken's "42 Best Form
  Design Examples" (eleken.co); on Dribbble, search "form design" and take
  high-polish shots — fictional brands are fine, only the image matters.
  Mobbin requires an account → use SaaSFrame (saasframe.io) instead. These
  are mostly *gallery images*: save the image asset itself, not a page
  screenshot.
- **T2:** these are *live pages* — capture with `capture-candidate.mjs`.
  Browse https://luma.com featured events for a strongly-themed event page;
  find a premium D2C recommendation quiz (skincare/supplement/eyewear brands —
  search "\<brand> skin quiz"); pick a startup waitlist page from the Framer or
  Webflow showcase galleries.
- **T3:** competitor showcases of real customer forms — NOT template
  galleries (templates are the mediocre shelf). Typeform's community
  "Typeform of the month" thread and the typeform.com/blog-tag/customer-story
  tag both link live branded forms; look for equivalent "made with X" pages
  for Tally/Fillout. Live pages → script capture.
- **T4:** roundup articles pre-curate volume: mycodelesswebsite.com/website-form/
  (22 examples) and justinmind.com/blog/form-examples-web-mobile/ (40+).
  Follow through to the *featured form's own live page* and capture that —
  don't screenshot the roundup article itself.

**Kind B — brand image (non-form).** Paired mainly with P4/P6 prompts ("use
this image's palette…"). Four sub-types, each sourced differently — the pilot
takes ~1 of each so the curation gate sees the range:

| Sub-type | What the image is | Where to get it |
|---|---|---|
| Brand-guideline page | A visually rich page/spread from a public brand style guide (palette swatches, type specimens) | https://brandingstyleguides.com/ directory; Canva's "50 meticulous style guides" roundup |
| Brand hero / product page | The hero section of a design-strong brand or product site | Any strong D2C brand site; capture as a live page with the script |
| Packaging / product shot | Photograph of well-designed packaging | Dieline (thedieline.com) features, or the brand's own press/product imagery |
| Poster / menu | An event poster or designed menu — flat graphic with strong palette + type | Behance/Dribbble poster searches, event pages, restaurant sites |

Selection bar for all sub-types: the palette must be *extractable* (≥3
non-neutral colors, or one dominant color plus striking typography) — the
downstream prompt asks the model to reuse it, so a beige-on-white minimalist
image fails even if it is beautiful. Guideline pages, packaging, and posters
are usually *image assets* (save directly); hero pages are live captures.

**Curation gate:** collect candidates with surplus (~1.5–2× the kept count) →
human eyeball pass applying the distinctiveness test (§ good-item point 2) →
keep the best. Record the source URL for every kept image (provenance +
reproducibility). The full sourcing-and-capture procedure is specified below.

### Sourcing procedure — step-by-step

This section is written so an engineer (or agent) new to the project can run the
sourcing pass without further guidance. Read `evals/expansion/candidates.md`
first — it holds the per-tier starting URLs (verified live 2026-07-19) and is
also the running log where every candidate is recorded.

#### Shared ground rules (both options)

- **Where files go:** `evals/expansion/candidates/` (create it if missing).
  Naming: `t<tier>-<slug>.png` for form-type candidates (e.g. `t2-luma-jazz-night.png`),
  `brand-<slug>.png` for brand images. Lowercase, hyphenated, descriptive slugs.
- **Log every candidate** in `evals/expansion/candidates.md` under its tier
  heading: filename, exact source URL, one line on why it was kept or rejected.
  An image without a recorded source URL is not usable.
- **Image requirements:** PNG; captures at 1440×900 (the pipeline standard);
  directly-saved gallery images should be ≥1000 px wide and free of heavy
  compression artifacts. Hero region only — no full-page scroll captures.
- **Never route images through Google Docs** — the Drive connector cannot
  extract them (learned with Paperform; INC-19 in the failure-archaeology
  skill). Save PNG files to disk directly.
- **Judging a candidate — the distinctiveness checklist.** Keep an image only
  if ALL of these hold:
  1. *Cover-the-logo test:* hide the brand name; the design should still be
     recognizably "someone's brand", not a generic template.
  2. *Non-default styling:* reject anything that looks like a stock
     blue/purple-on-white theme with system fonts (default Typeform/Google
     Forms themes, plain SaaS signup pages).
  3. *At least two distinctive elements* among: color palette, typography,
     illustration/photography style, layout structure, decorative motifs.
  4. *Survives the capture:* the style must be visible in the 1440×900 hero
     shot (not hidden below the fold or behind an interstitial).
  5. *Brand images only:* palette rich enough to extract — ≥3 non-neutral
     colors, or striking typography — since P4/P6 prompts ask the model to
     reuse the palette.
- **Quantity targets (pilot):** collect 3–4 candidates per form-type tier and
  ~6 brand images, so the owner curation gate can keep 2 per tier + ~4 brand
  with real choice. Scaling to ~60 later reuses the same procedure with higher
  volume.
- **Completion criteria:** 8 kept form-type PNGs (2 per tier T1–T4) + ~4 kept
  brand PNGs, every file verified (`sips -g pixelWidth -g pixelHeight <file>`
  shows sane dimensions; the image opens and looks like its source), every
  kept row in candidates.md marked KEPT with its URL.

#### Key insight: most captures need no browser automation at all

Any candidate that is a **live page URL** can be captured headlessly with the
repo's own tooling — no Chrome extension, no owner present:

```bash
cd evals/tools   # puppeteer is already installed here
node capture-candidate.mjs --url="<page url>" --out="../expansion/candidates/t2-<slug>.png"
```

`capture-candidate.mjs` mirrors the original pipeline's settings
(1440×900, networkidle2 + settle wait, hero screen only) and aborts on unknown
arguments. Browser automation or owner help is only needed for **discovery**
(browsing galleries to find the URLs) and for **image-shaped candidates**
(Dribbble shots, brand-guideline scans) that live inside galleries.

#### Option A — autonomous sourcing (Claude driving Chrome)

Use when the owner has connected the Claude-in-Chrome extension and told the
agent to drive. The owner must be reachable at start (browser selection needs
their confirmation) and at the end (curation gate); the browsing itself is
autonomous.

1. **Setup.** Load the Chrome MCP tools in ONE ToolSearch call (core set:
   `tabs_context_mcp`, `navigate`, `computer`, `read_page`, `tabs_create_mcp`;
   add `javascript_tool` and `find` for locating image URLs in galleries).
   Then: `list_connected_browsers` → confirm the browser with the owner →
   `select_browser` → `tabs_context_mcp`. Always fetch fresh tab IDs; if the
   MCP server disconnects mid-session (it has happened), re-run
   `tabs_context_mcp` and continue — never reuse pre-disconnect tab IDs.
2. **Conduct rules (non-negotiable):** read-only browsing. No logins, no
   signups, no CAPTCHAs, no accepting terms, no downloads via browser UI.
   Decline non-essential cookies. Skip account-gated galleries entirely
   (Mobbin is gated → use the SaaSFrame fallback in candidates.md). If a page
   fails to load or respond after 2–3 attempts, log it and move to the next
   source — do not loop.
3. **Discovery loop, per tier (T1→T4, then brand):** open the tier's starting
   URL from candidates.md, scan the gallery/list, open promising items, apply
   the distinctiveness checklist, and record keep/skip in candidates.md as you
   go. Stop at 3–4 keepers per tier.
4. **Capture, by candidate shape:**
   - *Live page* → run `capture-candidate.mjs` (terminal, not browser) on the
     URL.
   - *Gallery image* (Dribbble shot, brand-guideline scan) → find the direct
     image asset URL (`read_page` / `javascript_tool` on the `<img>` src),
     then fetch it from the terminal:
     `curl -L "<img src url>" -o evals/expansion/candidates/t1-<slug>.png`.
     Convert to PNG if the asset is JPEG/WebP
     (`sips -s format png in.jpg --out out.png`). These images are used only
     as internal eval inputs, not republished.
5. **Verify** every file (dimensions + visual open), finish the candidates.md
   log, and present the collected set to the owner for the curation gate.
6. **Fallback:** if the extension disconnects and will not reconnect, switch
   to Option B — the work is the same, only discovery changes hands.

#### Option B — owner-in-the-loop sourcing

Use when no Chrome session is available, or the owner prefers to pick images
themselves. Split the work by what needs a human:

1. **Engineer/agent: compile a candidate URL list without a browser.** Use web
   search plus the starting points in candidates.md to list 4–6 concrete
   candidate URLs per tier, each with a one-line rationale against the
   distinctiveness checklist (judge from search snippets/thumbnails where
   possible; final judgment happens at curation).
2. **Engineer/agent: capture everything URL-shaped headlessly** with
   `capture-candidate.mjs` (no owner needed). Inspect each capture — if the
   hero shot caught a cookie wall or loading state, retry once; if it persists,
   flag that URL for the owner instead.
3. **Owner: manual captures for the rest.** Hand the owner the short list of
   gallery/gated/image-shaped candidates with exact instructions per item:
   open the URL, screenshot the hero area at full browser width (macOS:
   Cmd+Shift+4, or a full-window capture), save as PNG using the exact
   filename given (e.g. `t1-dribbble-fintech-onboarding.png`) into
   `evals/expansion/candidates/`. No Google Docs, no resizing needed.
4. **Owner curation gate.** Present all candidates (opening the folder in
   Finder is sufficient) with the candidates.md log alongside. The owner
   applies the distinctiveness test and marks keep/reject; the engineer
   records KEPT/REJECTED per row in candidates.md and confirms the completion
   criteria above are met.

Option A collects faster and can judge full-size images during discovery;
Option B needs no extension and puts the owner's eye directly on selection.
They compose: run B's headless captures first, use A (or the owner) only for
what discovery and gallery images remain.

### Target composition (~60 items, approximate)

By style-guide kind:

| Kind | Share |
|---|---|
| Form-type screenshot | ~35% (~22) |
| Brand image | ~30% (~18) |
| No style guide | ~30% (~18) |

By prompt class (crossed with the above):

| Prompt class | Share | Notes |
|---|---|---|
| P1 simple/vague | ~25% | includes the no-guide + vague cell = layout-unspecified free choice |
| P2 specific layout | ~17% | |
| P3 layout-from-guide, new theme | ~10% | form-type guides only |
| P4 palette-from-guide, new layout | ~20% | weighted toward brand images |
| P5 no guide, fully specified | ~15% | |
| P6 theme only, layout unspecified | ~8% | |

### Pilot (gate before scaling)

~12 items covering every (guide-kind × prompt-class) cell at least once, using:
- 8 form-type style guides (2 per sourcing tier T1–T4)
- ~4 brand-image style guides
- the no-guide prompt classes

Generate via the standard local pipeline (working-tree SI + validator), then
quality-check by eyeball/rating **before** scaling to 60. Pilot success =
style guides pass the distinctiveness bar in practice, prompt classes produce
discriminably different outputs, and generated quality justifies the sourcing
tiers' effort ordering.

## Measurement

- Groundedness/wiring: automatic via the QI-4 validator on every generation.
- Dimensions 3 & 4: human rating per `evals/rater_instructions.md` for the
  pilot; the LLM-judge (FI-3 in `requirements/future_improvements.md`) is the
  intended scaling path — expansion to the full 60 should land together with or
  after it, since 120+ generations exceed practical human rating.

## Out of scope (this expansion)

- Multi-turn / iterative-edit evals (owner decision; revisit after v1)
- Explicit style-coherence pairs (implicitly covered)
- Question-type stress coverage (de-prioritized; the existing 37-item set
  remains the groundedness/functionality regression baseline)
- Adversarial prompt-vs-guide conflict items (not discussed as v1 scope)

## Execution outline

1. Author the prompt bank (~18–20 prompts across P1–P6).
2. Sourcing pass: follow "Sourcing procedure — step-by-step" above (Option A
   or B), collecting 3–4 candidates per tier + ~6 brand images into
   `evals/expansion/candidates/`, logged in `evals/expansion/candidates.md`.
3. Owner curation gate on candidates (keep 2 per tier + ~4 brand).
4. Assemble pilot items (sources file extension: items reference a base form
   id, a style-guide file, and a prompt id), generate locally, validator on.
5. Rate pilot → review composition → scale to ~60.
