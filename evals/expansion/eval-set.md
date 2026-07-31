# Forms AI Restyler — Eval Set (Pilot)

This is the pilot test set for the Forms AI Restyler — a tool that redesigns a plain Google Form into a polished, on-brand one. Each row below is a single test case: a real Google Form, a styling instruction, and (sometimes) a style-guide image. The tool generates a restyled version from these inputs, which is then rated on how good it looks and how well it followed the instruction.

_15 test cases._

| # | Form (live link) | Instruction type | Prompt (styling instruction) | Style guide type | Style guide |
|---|---|---|---|---|---|
| 1 | [Liquid Death Country Club — Membership Registration](https://docs.google.com/forms/d/e/1FAIpQLSe4Xvsw6M9hqJmzbmbgMOPqLWZaS31FZ6BAL2yB4sFFQovKIg/viewform) | Open-ended | Restyle this form so it feels on-brand with the attached image. | Brand image | brand-liquid-death.png |
| 2 | [Liquid Death Country Club — Membership Registration](https://docs.google.com/forms/d/e/1FAIpQLSe4Xvsw6M9hqJmzbmbgMOPqLWZaS31FZ6BAL2yB4sFFQovKIg/viewform) | Brand colors, own layout | Use the color palette from the attached image; choose whatever layout best fits this form. | Brand image | brand-liquid-death.png |
| 3 | [OLIPOP Wholesale & Stockist Application](https://docs.google.com/forms/d/e/1FAIpQLSdFkPGIAoqFYvXn5qImSs194cxhN1H_b9ulaOvLkpaTmxcBQQ/viewform) | Brand colors, own layout | Use the brand colors from the attached image and design the form as a single-page card layout. | Brand image | brand-olipop.png |
| 4 | [Omsom Catering & Bulk Order Inquiry](https://docs.google.com/forms/d/e/1FAIpQLSesTHohs8g1j68i0ORcOrzxH6-4K675Tvn9KSFdJy-nBSXh1A/viewform) | Brand colors, own layout | Extract the color palette from the attached image and build a multi-step form, one question per screen. | Brand image | brand-omsom.png |
| 5 | [Omsom Catering & Bulk Order Inquiry](https://docs.google.com/forms/d/e/1FAIpQLSesTHohs8g1j68i0ORcOrzxH6-4K675Tvn9KSFdJy-nBSXh1A/viewform) | Brand colors, own layout | Use this image's palette and typography feel for a compact single-screen form. | Brand image | brand-omsom.png |
| 6 | [Magic Spoon — Flavor Feedback & Research](https://docs.google.com/forms/d/e/1FAIpQLSfc5lB2hB22I7UQkhvKNN30zHNPbVqQexUEjshW-vwcWTi4PA/viewform) | Open-ended | Restyle this form so it feels on-brand with the attached image. | Brand image | brand-magic-spoon.png |
| 7 | [Magic Spoon — Flavor Feedback & Research](https://docs.google.com/forms/d/e/1FAIpQLSfc5lB2hB22I7UQkhvKNN30zHNPbVqQexUEjshW-vwcWTi4PA/viewform) | Mood only | Capture the mood and personality of the attached image; the layout is your choice. | Brand image | brand-magic-spoon.png |
| 8 | [Riverside Community 5K — Runner Registration](https://docs.google.com/forms/d/e/1FAIpQLSeUi0RHPuVdM_Nom7dNnGIouGvRnkpua6KZ6NfT9qRQ27c3IA/viewform) | Fully specified design | Design this as a single-column form on a deep navy background with white sans-serif text, gold accent buttons, and rounded cards. | None | — |
| 9 | [Riverside Community 5K — Runner Registration](https://docs.google.com/forms/d/e/1FAIpQLSeUi0RHPuVdM_Nom7dNnGIouGvRnkpua6KZ6NfT9qRQ27c3IA/viewform) | Open-ended | Make this form beautiful. | None | — |
| 10 | [Annual Team Offsite — Planning Survey](https://docs.google.com/forms/d/e/1FAIpQLSd44Z1hgAvdgXuQl2FJ96t0nxBeXn9E6Irmv6gtRIN2y7GQsQ/viewform) | Specific layout | Redesign this form as a multi-step flow with one question per screen and a progress bar at the top. | None | — |
| 11 | [Annual Team Offsite — Planning Survey](https://docs.google.com/forms/d/e/1FAIpQLSd44Z1hgAvdgXuQl2FJ96t0nxBeXn9E6Irmv6gtRIN2y7GQsQ/viewform) | Mood only | Style this form with a warm, botanical, editorial feel. | None | — |
| 12 | [Product Feedback Survey](https://docs.google.com/forms/d/e/1FAIpQLSeQMkpAyUBCXlGQjX0lr7m_YpayE0jcULlEPd_T9-KdHGtdbg/viewform) | Fully specified design | Minimal editorial black-and-white: white background, black serif headings, thin rules between sections, and a single bold red accent. | None | — |
| 13 | [Product Feedback Survey](https://docs.google.com/forms/d/e/1FAIpQLSeQMkpAyUBCXlGQjX0lr7m_YpayE0jcULlEPd_T9-KdHGtdbg/viewform) | Specific layout | Redesign this as a single-page form with all questions in one clean scrollable column, clearly grouped into labelled sections. | None | — |
| 14 | [User Research Participant Screener](https://docs.google.com/forms/d/e/1FAIpQLScIknjOERx6ItYehNOYLJ4xDt41b0sZFSzOwjHn31sqfZKo6g/viewform) | Fully specified design | Single page, soft pastel pink and lavender gradient background, playful rounded style, big friendly buttons. | None | — |
| 15 | [User Research Participant Screener](https://docs.google.com/forms/d/e/1FAIpQLScIknjOERx6ItYehNOYLJ4xDt41b0sZFSzOwjHn31sqfZKo6g/viewform) | Mood only | Make this feel like a trustworthy, modern fintech brand — clean, confident, and professional. | None | — |

## Definitions

**Instruction type** — what kind of styling direction the prompt gives:

- **Open-ended** — Minimal direction — the tool decides the whole look itself. (e.g. “Make this form beautiful.”)
- **Brand colors, own layout** — Take the colour palette from the attached brand image, but design the layout freely.
- **Mood only** — A mood or vibe is given (e.g. “warm and botanical”); the layout is left to the tool.
- **Fully specified design** — Exact colours and layout are described in words, with no reference image attached.
- **Specific layout** — Asks for a particular structure — such as multi-step (one question per screen) or a single scrolling column.

**Style guide type** — what kind of visual reference (if any) is attached:

- **Brand image** — A non-form image of a brand (packaging, product, hero, logo world). The tool pulls its colours and mood onto the form.
- **None** — No reference image is attached; the styling direction is text-only.
