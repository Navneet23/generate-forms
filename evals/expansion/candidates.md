# Style-Guide Candidate Sourcing — Pilot (2 per tier + brand images)

Status: sourcing pass started 2026-07-19. Candidates below need a browse-and-capture
session (screenshot → `evals/expansion/candidates/*.png`), then the owner curation
gate (distinctiveness test) picks the pilot set: 8 form-type (2 per tier) + ~4 brand
images. Record the final source URL per kept image here.

**How to run the capture:** follow "Sourcing procedure — step-by-step" in
`requirements/eval_set_expansion.md` (Option A: Claude drives Chrome; Option B:
headless `evals/tools/capture-candidate.mjs` + owner picks/captures gallery images).
The judging checklist and file-naming rules live there too.

## Tier 1 — designer showcases / UI-pattern libraries (target: 2)

Starting points (verified live 2026-07-19 via search):
- Muzli form-design inspiration collection: https://muz.li/inspiration/forms/
- Eleken "42 Best Form Design Examples": https://www.eleken.co/blog-posts/form-design-examples
- Dribbble search "form design" (pick 2 high-polish shots; concepts with fictional brands are acceptable)
- Mobbin (requires account — fallback: SaaSFrame, e.g. https://www.saasframe.io/examples/luma-event-details)

## Tier 2 — in-the-wild branded forms (target: 2)

- Luma featured events: browse https://luma.com (pick one strongly-themed live event page)
- Premium D2C product quiz (skincare/supplement/eyewear recommendation quiz — pick from a live brand site)
- Startup waitlist page from Framer/Webflow showcase galleries

## Tier 3 — competitor customer stories / showcases (target: 2)

- Typeform community "Typeform of the month" (real branded customer forms, e.g. Gated's testimonial form): https://community.typeform.com/typeform-customer-stories-61/typeform-of-the-month-gated-s-five-star-testimonial-collection-form-9752
- Typeform customer-story blog tag: https://www.typeform.com/blog-tag/customer-story
- Look for equivalent "made with X" showcases for Tally/Fillout

## Tier 4 — third-party roundups (target: 2)

- https://mycodelesswebsite.com/website-form/ (22 examples, updated 2026)
- https://www.justinmind.com/blog/form-examples-web-mobile/ (40+ examples)
- Pick 2 forms featured in these that have live, screenshot-able pages

## Brand images (non-form; target: ~4)

- Brand-guideline document directory: https://brandingstyleguides.com/ (pick 2 visually rich guideline pages)
- Canva "50 best brand style guides": https://www.canva.com/learn/50-meticulous-style-guides-every-startup-see-launching/
- 1 packaging/product shot from a strong D2C brand (Dieline or brand site hero)
- 1 event poster or menu-style image

## Capture rules

- URL-shaped sources: Puppeteer hero screenshot (1440x900), same as the original pipeline.
- Gallery/Dribbble images: save the image directly as PNG. NEVER deliver images via
  Google Docs (Drive connector cannot extract them — Paperform lesson).
- Name candidates `t<tier>-<slug>.png` / `brand-<slug>.png`; record source URL here.

## Capture log — run 1 (2026-07-20, Option B headless half)

Tooling worked perfectly (every capture came out 1440×900). The limiting factor is
the TARGET, not the tool — see finding below.

**KEPT (in `candidates/`, verified visually):**

| File | Source URL | Why kept |
|---|---|---|
| `t2-chantecaille-routine-finder.png` | https://chantecaille.com/pages/skincare-routine-finder | Real live quiz; luxury-editorial brand — serif wordmark, blush/cream palette, icon-card options, product photography, progress bar. Custom (non-Luma, non-template) layout. Only a dismissable bottom cookie bar; form fully visible. |
| `t2-luma-ddx-dubai.png` | https://lu.ma/ddxdubai | Design-conference event page; muted green/gold poster cover, clean two-column event layout. |
| `t2-luma-shift-miami.png` | https://lu.ma/shiftmiami | Bold purple→pink→cyan gradient background, strong display type, Infobip Shift cover. Good palette reference. |

**REJECTED this run:**

- `skinceuticals.com/advanced-routine-finder.html` — Cloudflare "verify you are human" bot wall.
- `origins.com/skincare-routine-finder` — Akamai "Access Denied".
- `goodmolecules.com/skincare-quiz` — bot "confirm you are human" wall.
- `us.medik8.com/pages/skincare-quiz` — page loaded but buried under cookie banner + rewards popup + accessibility widget; hero unusable without dismissing overlays (needs interaction → Option A/owner).
- Extra Luma events (pitchxl, metacomference) captured but dropped: Luma pages all share ONE layout, so >2 over-indexes the set on the Luma template. Keep Luma as palette/brand references, not layout diversity.

**Finding (important for planning):** headless capture of major **D2C brand** sites is
low-yield — 3 of 4 were hard bot walls (Cloudflare/Akamai), the 4th overlay-clogged.
The clean-yield veins for the headless path are (a) **event pages** (Luma — but
layout-homogeneous) and (b) **Shopify-based indie/luxury brands** that don't gate bots
(Chantecaille). The specific *branded forms* likely wanted (major-brand quizzes) and the
**Tier-1 designer galleries** (Muzli/Dribbble — image assets, not live pages) need the
Chrome/Option A path or owner manual capture to get past bot walls / cookie overlays.

**Next captures to try headlessly (gentler targets):** Framer/Webflow template live
previews (purpose-built to view, no bot protection), smaller indie Shopify quiz/waitlist
brands, more Luma events for palette variety. Tier 1 + brand-guideline scans → defer to
Option A / owner.

## Capture log — run 2 (2026-07-20, template previews)

**KEPT (verified):**

| File | Source URL | Why kept |
|---|---|---|
| `t1-framer-wait-waitlist.png` | https://wait.framer.media/ | Light theme, lime/chartreuse accent, clean centered email-capture, avatar social proof, video card. Distinctive palette; small unobtrusive "Made in Framer" badge. |
| `t1-framer-waitliz.png` | https://wprotemplate.framer.website/ | Dark glassmorphism card, blue accent, cosmic nebula background, countdown blocks. Very distinctive; layout-diverse from the light one. |

**REJECTED:**

- `https://waitup.framer.website/` — dead ("Site Not Found").
- `https://framerforms.com/templates/3d-survey-form-template` and `/multi-step-forms`
  — these are FramerForms **product marketing pages** (own nav/CTA chrome), not raw
  form previews. The `framerforms.com/templates/...` URLs are not the live form; the
  actual form demo is behind a "Use template" action.
- `https://www.drinktrade.com/pages/find-my-match` (Trade Coffee quiz) — puppeteer
  crashed twice on it (hard redirect/JS). → owner/Option A.

**Two published Framer templates (`*.framer.website` / `*.framer.media`) captured
cleanly** — this is the reliable headless vein for polished, layout-diverse form/landing
style guides. Note both are waitlist templates (email-capture heroes); for form-layout
variety, the deferred list needs true multi-step/application form references.

## Headless pass summary + handoff to Option A / owner

**Collected this session: 5 verified keeps** — 2 Tier-1 (Framer templates), 3 Tier-2
(Chantecaille quiz + 2 Luma events). Tooling is proven; the headless-friendly veins are
mapped (template previews, Luma, indie luxury Shopify).

**Deferred to the Chrome/Option A or owner-manual pass** (gallery-image or bot-walled —
not headless-capturable):

- **Tier 1 designer galleries** (image assets inside galleries, need discovery + asset
  download): Muzli `https://muz.li/inspiration/forms/`, Eleken 42-examples, Dribbble
  "form design" — save 2-3 high-polish shots directly.
- **Tier 3 competitor customer showcases** (find the live branded customer forms):
  Typeform "of the month" community thread + `typeform.com/blog-tag/customer-story`;
  equivalent "made with Tally/Fillout" — 2 forms.
- **Tier 2 bot-walled brand quizzes** worth grabbing via a real browser (decline
  cookies, dismiss overlays): SkinCeuticals/Origins/Good Molecules routine finders,
  Medik8 skincare quiz, Trade Coffee `drinktrade.com/pages/find-my-match`.
- **Brand images (~4-6):** brand-guideline scans from `brandingstyleguides.com` +
  Canva's "50 style guides"; 1 packaging shot (Dieline); 1 poster/menu. All gallery
  images → save directly.

Owner curation gate runs after this deferred pass fills the tiers to target
(2/tier form-type + ~4 brand).

## Capture log — run 3 (2026-07-20, indie brands + Kind B)

Pivoted to indie/Shopify brands (gentler than mega-DTC) and deliberately grabbed
**Kind B brand images** (had zero before). D2C quiz subpages still mostly walled;
brand homepages of indie Shopify brands render well and make strong Kind B references.

**KEPT (verified):**

| File | Kind | Source URL | Why kept |
|---|---|---|---|
| `t2-prose-consultation.png` | A form-type | https://prose.com/consultation | Real hair-consultation intro; editorial DTC — serif wordmark, custom product photography (orange/lavender labels), cream/dark-green palette, two-column. Adds layout diversity (consultation, not waitlist/event). |
| `brand-liquid-death.png` | B brand | https://liquiddeath.com | Maximalist — hot magenta bg, gold/purple cans, gothic blackletter wordmark, bold condensed sans. Extreme, unmistakable palette. |
| `brand-olipop.png` | B brand | https://drinkolipop.com | Retro-groovy — teal/cream/yellow, rounded serif, hand-drawn landscape illustration. Warm, distinctive. |
| `brand-omsom.png` | B brand | https://omsom.com | Maximalist Asian-American food — warm red/orange/amber, bold yellow packaging, dramatic food photography, starburst callout. |
| `brand-magic-spoon.png` | B brand | https://magicspoon.com/pages/build-a-box | Playful — yellow bg, purple logo, whimsical character illustration, pastel accents. NOTE: URL 404'd but the branded 404 fully shows the brand language; owner may swap for the homepage. |

**REJECTED this run (walls/clutter/404 → see owner-capture-tasks.md):**
Curology (Cloudflare block), Hims (Cloudflare wall), Ritual (redirected to shop + geo-modal),
Nutrafol (404 — wrong quiz path, site renders), Warby Parker (scheduled maintenance),
Topicals (spin-to-win modal covers page), Jones Road / Function of Beauty / Care-of / DedCool
(puppeteer crash — likely wrong URL path).

## FINAL TALLY — headless pass (2026-07-20): 10 verified keeps

**Kind A form-type (6):** t1-framer-wait, t1-framer-waitliz (Tier-1 templates);
t2-chantecaille, t2-prose (in-the-wild quizzes/consultations); t2-luma-ddx,
t2-luma-shift (event pages). **Kind B brand images (4):** liquid-death, olipop,
omsom, magic-spoon.

Good spread across both kinds and a range of moods (luxury-editorial, retro,
maximalist, playful, dark-glass, event). Still thin on **Tier-1 designer-gallery
shots** and **Tier-3 competitor customer forms** — both deferred to
`owner-capture-tasks.md` (gallery images / bot-walled, not headless-capturable).
