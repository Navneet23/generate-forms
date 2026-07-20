# Owner Capture Tasks — style guides I can't get headlessly

These are candidates that hit a wall for headless capture (bot protection, cookie
overlays that need dismissing, or gallery *images* that aren't standalone pages).
Each needs a few seconds in a normal browser. This doc is the running to-do for the
owner (or a Claude-in-Chrome / Option A session).

## How to capture (per item)

1. Open the URL in a normal browser.
2. If a cookie banner appears, **Decline** / reject non-essential.
3. If the target is a **live page**: screenshot the hero area at ~full browser width
   (macOS: Cmd+Shift+4, drag; or full-window Cmd+Shift+3 then crop). ~1400px wide.
4. If the target is a **gallery image** (Dribbble shot, guideline scan): open the image
   itself and save it directly as PNG (right-click → Save Image).
5. Save into `evals/expansion/candidates/` using the exact filename given below.
6. Tick the box here and add one line on whether it's worth keeping.
7. **Never** route images through Google Docs (Drive connector can't extract them).

Target sizes: Kind A form-type = 8 kept (2 per tier T1–T4). Kind B brand images = ~4 kept.
Collect with surplus so the curation gate has real choice.

---

## Tier 1 — designer showcases (gallery images; save the image directly)

- [ ] `t1-muzli-<slug>.png` — browse https://muz.li/inspiration/forms/ , pick 2 high-polish
      form shots (distinctive palette/typography/layout; fictional brands are fine).
- [ ] `t1-dribbble-<slug>.png` — https://dribbble.com search "form design" / "multi step form";
      open a shot, save the full image. Pick 1–2 that pass the distinctiveness checklist.

## Tier 3 — competitor customer showcases (find the live branded form, screenshot hero)

- [ ] `t3-<brand>.png` — Typeform "of the month" community thread
      (https://community.typeform.com , customer-stories) + typeform.com/blog-tag/customer-story;
      open the actual live customer form and screenshot it. Target 2 real branded forms
      (NOT template-gallery defaults).

## Tier 2 — bot-walled brand quizzes (real browser passes the wall; decline cookies)

These are strong, distinctive D2C quizzes that a headless browser can't reach (Cloudflare/
Akamai walls or overlay clutter). In a normal browser they load fine. Only need ~1–2 of
these to round out Tier 2 — pick the most distinctive.

- [ ] `t2-skinceuticals-routine-finder.png` — https://www.skinceuticals.com/advanced-routine-finder.html  (Cloudflare wall)
- [ ] `t2-origins-routine-finder.png` — https://www.origins.com/skincare-routine-finder  (Akamai "Access Denied")
- [ ] `t2-good-molecules-quiz.png` — https://www.goodmolecules.com/skincare-quiz  (bot wall)
- [ ] `t2-curology-welcome.png` — https://curology.com/welcome/  (Cloudflare "you have been blocked")
- [ ] `t2-hims-consultation.png` — https://www.hims.com/consultation  (Cloudflare wall)
- [ ] `t2-trade-coffee-quiz.png` — https://www.drinktrade.com/pages/find-my-match  (headless crashed)
- [ ] `t2-topicals.png` — https://mytopicals.com  (spin-to-win modal covers page → dismiss it, then shoot)
- [ ] `t2-warby-parker-quiz.png` — https://www.warbyparker.com/quiz  (was down for scheduled maintenance — retry)

**Correct-URL-needed (site renders, my guessed path 404'd — find the real quiz link in the nav):**
- [ ] Nutrafol — https://nutrafol.com , click "Take the Quiz" (renders fine, palette: cream + teal)
- [ ] Function of Beauty — https://functionofbeauty.com , find hair-quiz link
- [ ] Jones Road Beauty — https://www.jonesroadbeauty.com , find shade-match quiz
- [ ] Magic Spoon — https://magicspoon.com (homepage) if you want the real hero vs. the branded-404 I kept

## Kind B — brand images (non-form; ~4 kept). Gallery images → save directly.

- [ ] `brand-guideline-<name>.png` — https://brandingstyleguides.com/ , open 1–2 visually rich
      guideline pages (palette swatches + type specimens), save the guideline image.
- [ ] `brand-canva-<name>.png` — https://www.canva.com/learn/50-meticulous-style-guides-every-startup-see-launching/
      pick 1 striking style-guide image.
- [ ] `brand-packaging-<name>.png` — a strong packaging shot (e.g. thedieline.com feature, or a
      D2C brand's product press image). Save the image.
- [ ] `brand-poster-<name>.png` — one designed event poster or menu with a strong palette + type.

---

## Already collected headlessly (for reference — do NOT redo)

10 kept in `candidates/` (see `candidates.md` capture log):
- Kind A form-type (6): `t1-framer-wait-waitlist`, `t1-framer-waitliz`,
  `t2-chantecaille-routine-finder`, `t2-prose-consultation`, `t2-luma-ddx-dubai`,
  `t2-luma-shift-miami`.
- Kind B brand image (4): `brand-liquid-death`, `brand-olipop`, `brand-omsom`,
  `brand-magic-spoon`.

So the biggest remaining GAPS for you/Option A are: **Tier-1 designer-gallery shots**
and **Tier-3 competitor customer forms** (top two sections above), plus optionally 1–2
more Kind-A form-type from the bot-walled quiz list. Kind B is essentially covered.
