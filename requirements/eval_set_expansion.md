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
assets: author ~18–20 concrete prompts across the classes, store them with the
sources so items are reproducible.

### Style-guide inventory: two kinds

**Kind A — form-type (screenshot of a designed form/flow).** Sourced across
four tiers; the pilot takes **2 candidates from each tier**:

| Tier | Source | Character |
|---|---|---|
| T1 | UI-pattern libraries & designer showcases (Mobbin, Page Flows, Nicely Done; Dribbble/Behance form concepts) | Highest polish; concepts with fictional brands are acceptable — only the image matters |
| T2 | In-the-wild branded forms (Luma event pages, D2C product quizzes, startup waitlists, design-conscious application forms) | Most representative of real creator input |
| T3 | Competitor customer stories / showcases ("made with X", case studies) — NOT template galleries | Real branded forms; templates are the mediocre shelf and are avoided |
| T4 | Third-party "best form design" roundups | Pre-curated volume filler |

**Kind B — brand image (non-form).** Public brand-guideline pages, brand hero
sections and product pages, packaging design (e.g. Dieline), Behance brand
identity projects, event posters, menus. Paired mainly with P4/P6 prompts
("use this image's palette…").

**Curation gate:** collect ~50 candidates → human eyeball pass applying the
distinctiveness test (§ good-item point 2) → keep the best. Record the source
URL for every kept image (provenance + reproducibility). Screenshots via the
existing Puppeteer tooling for URL-shaped sources; gallery images saved
manually as PNGs into `evals/style-guides/` (never route images through Google
Docs — the Drive connector cannot extract them; learned with Paperform).

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
2. Sourcing pass: candidate list with URLs (2 per tier for the pilot's
   form-type guides + brand-image candidates), screenshot/save, record sources.
3. Owner curation gate on candidates.
4. Assemble pilot items (sources file extension: items reference a base form
   id, a style-guide file, and a prompt id), generate locally, validator on.
5. Rate pilot → review composition → scale to ~60.
