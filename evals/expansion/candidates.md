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
