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
