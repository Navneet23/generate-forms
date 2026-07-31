# Forms AI Restyler — Eval Set: Text-only Prompts

This is the text-only slice of the eval set for the Forms AI Restyler — a tool that redesigns a plain Google Form into a polished one. Every row is one test case: a real Google Form plus a typed styling instruction (no reference image). The tool restyles the form from the instruction, and the result is rated on how good it looks and how well it followed the instruction. The last four columns classify the *kind* of instruction (see Definitions).

_30 test cases._

| # | Form (live link) | Text prompt | Detail | Layout/theme | Form context | Phrasing |
|---|---|---|---|---|---|---|
| 1 | [Ridgeline Pottery Studio — Wheel-Throwing Workshop Registration](https://docs.google.com/forms/d/e/1FAIpQLSfgDHlZQBBHknh3SdxeYpPeLhL3OA5xzLai3UoZ7j4Mv5g7zg/viewform) | This is the signup for our beginner wheel-throwing workshop at Ridgeline Pottery — make it look clean and inviting. | Simple | None | Domain-aware | Polished |
| 2 | [Verdant Botanicals — Wholesale Stockist Application](https://docs.google.com/forms/d/e/1FAIpQLSeuLWrIgvIkzWBUuux8_1dSNXTvl62JlnNVVv7ERVdkkV50KA/viewform) | Make this form look clean and professional. | Simple | None | Agnostic | Polished |
| 3 | [Northgate Music Festival — Food & Craft Vendor Application](https://docs.google.com/forms/d/e/1FAIpQLSe_MVi1l53uxe69T1g3H_MmgDAYy8YAPY0ZxWq8pfAMYX9pCA/viewform) | This is a vendor application for the Northgate Music Festival — give it a polished, professional look. | Simple | None | Domain-aware | Polished |
| 4 | [Pixel & Pine Co. — Custom Furniture Order](https://docs.google.com/forms/d/e/1FAIpQLSfwq0VRZWfpGW1YeiHbJ8x0g3TlhIHu1kkvUHpUXXxIoNRbQQ/viewform) | just make this look nice and clean please, nothing too fancy | Simple | None | Agnostic | Messy |
| 5 | [Summit Strength Gym — New Member Intake](https://docs.google.com/forms/d/e/1FAIpQLSd9FlqKoAIVebaPnMnaadwjVCkYMqneRaIYCfF9tfZeHdcmEw/viewform) | hey this is the intake form for summit strength gym, can you make it look good and kinda modern | Simple | None | Domain-aware | Messy |
| 6 | [Brightleaf Coffee Roasters — Subscription Signup](https://docs.google.com/forms/d/e/1FAIpQLSdvvoi2Xf72_GXMNWgZL7snUem2coPRvm4bvfhqGViRWSBqCw/viewform) | Make it warm and cozy. | Simple | Theme only | Agnostic | Polished |
| 7 | [Coastal Paws Veterinary — New Patient Registration](https://docs.google.com/forms/d/e/1FAIpQLSe6ZZqN--Lz27FZi7guDTW0vGxOcPcr_4PJK00ejgqLUetv3w/viewform) | This is for Coastal Paws Veterinary — make it feel friendly and reassuring. | Simple | Theme only | Domain-aware | Polished |
| 8 | [Lumen Analytics — Smart Dashboards Beta Feedback](https://docs.google.com/forms/d/e/1FAIpQLSf-w_bKx1kqCzfwAUk_OFS90_g1ljTkF8-lOhhhTi4y7SqVvQ/viewform) | Make it sleek and modern. | Simple | Theme only | Agnostic | Polished |
| 9 | [Aurora Yoga Collective — 200-Hr Teacher Training Application](https://docs.google.com/forms/d/e/1FAIpQLSeKuFZXEwF-JpqnrfYHjJ5McDai_YcIsMpNqzYFAtMKs-ZLvw/viewform) | This is Aurora Yoga's teacher-training application — make it calm and serene. | Simple | Theme only | Domain-aware | Polished |
| 10 | [Tandem Bikes — Warranty Claim](https://docs.google.com/forms/d/e/1FAIpQLSdxahSuG3aH6yKaxL8HLP7Bb93N0dmnAYotclPIIxFBkTe4xQ/viewform) | can you make it feel clean and trustworthy and kind of friendly | Simple | Theme only | Agnostic | Messy |
| 11 | [Fernwood Summer Camp — Camper Registration](https://docs.google.com/forms/d/e/1FAIpQLScm1G9co1Zcx4Ws4_ypOI7gS1feBiYBQpkE46nfcdbd07rnwA/viewform) | this is for fernwood summer camp so make it fun and bright and playful for parents signing up their kids | Simple | Theme only | Domain-aware | Messy |
| 12 | [Harborview Dental — Appointment Request](https://docs.google.com/forms/d/e/1FAIpQLSeQFtLQnT2fEuUkO1NVkxJqHA7M0m4zyz5SkamMUvm2IkqofA/viewform) | Show one question per screen. | Simple | Layout only | Agnostic | Polished |
| 13 | [Metro Cycling Club — Saturday Group Ride RSVP](https://docs.google.com/forms/d/e/1FAIpQLScPijX-19R3Km-mzfvfLlCqhu_PSl5BYxk6T4kvj02cuWqGvw/viewform) | Put everything on a single page. | Simple | Layout only | Agnostic | Polished |
| 14 | [Byte Academy — Full-Stack Coding Bootcamp Application](https://docs.google.com/forms/d/e/1FAIpQLSdyFtiFQ-xR55XhO_tcqImiMX5JtV7Vmsffgkss9MKiUR_lLw/viewform) | This is Byte Academy's coding bootcamp application — show one question at a time. | Simple | Layout only | Domain-aware | Polished |
| 15 | [The Rusty Spoon Bistro — Private Event Reservation](https://docs.google.com/forms/d/e/1FAIpQLSeb9ff6qaMkokfv2lH-tuiwpXo406AmMJ48Krx3v0IEeg1E-Q/viewform) | One question per screen, please. | Simple | Layout only | Agnostic | Polished |
| 16 | [Cedar & Sage Spa — Wellness Consultation Intake](https://docs.google.com/forms/d/e/1FAIpQLSdk4PpvV7jsDpXzrir8F_reuvVm1ZujkCz70cTgqEGxuTLQSQ/viewform) | Keep everything on a single page. | Simple | Layout only | Agnostic | Polished |
| 17 | [Willowbrook Wedding Venue — Booking Inquiry](https://docs.google.com/forms/d/e/1FAIpQLSfq-Rs-LfdDkfJZqAGEbzngWNybnIjOcdeJTehpPPvnI3GvUw/viewform) | Single page, elegant and romantic. | Simple | Both | Agnostic | Polished |
| 18 | [Nimbus Cloud — Enterprise Demo Request](https://docs.google.com/forms/d/e/1FAIpQLSfDDd6N6M6OioI74G6B23nnTM7WMudzhUE-4c67qVjGAXgK_w/viewform) | One question per screen, clean and professional. | Simple | Both | Agnostic | Polished |
| 19 | [Homestead Farms — CSA Box Preferences](https://docs.google.com/forms/d/e/1FAIpQLSfWb92cVN7It-6Dhr5yZZA4uU2_BjgQ_MeQ4DL34VBNgNMhhQ/viewform) | Single page, warm and rustic. | Simple | Both | Agnostic | Polished |
| 20 | [Maker's Guild — Annual Conference Registration](https://docs.google.com/forms/d/e/1FAIpQLSeGbfrn5XjMHlL2411bzCcU2dPXcFZHEEf8O7qDl5hCU3oDgw/viewform) | This is registration for the Maker's Guild annual conference — one question per screen, modern and energetic. | Simple | Both | Domain-aware | Polished |
| 21 | [Vantage Realty — Property Viewing Request](https://docs.google.com/forms/d/e/1FAIpQLScoZgTyczncuYJL7fv_5FAiZuMDpZJCKZS8JKJHfCBHg-RAkQ/viewform) | Question by question, with a header image at the top of each step. | Detailed | Layout only | Agnostic | Polished |
| 22 | [Solstice Retreat Center — Retreat Booking](https://docs.google.com/forms/d/e/1FAIpQLSeWfmBp0yFRFzyJN9TShaGjlLjb1lOhVsbY2GM0IIjWaFIclg/viewform) | This is the booking form for Solstice Retreat Center — question by question with a hero image on the left side of each question. | Detailed | Layout only | Domain-aware | Polished |
| 23 | [Quillbook Publishing — Manuscript Submission](https://docs.google.com/forms/d/e/1FAIpQLSfEQaOpPLFAUn9H9c50dFbuV1ykb5cPp237XOiv0oDAWd3n5A/viewform) | Single page with a header image across the top. | Detailed | Layout only | Agnostic | Polished |
| 24 | [Trailhead Outfitters — Backcountry Gear Rental Reservation](https://docs.google.com/forms/d/e/1FAIpQLSdOE0rGyBXWjhwScPY_FHrcfbrm3hwWZqaHs4_icYQWLKgpTA/viewform) | Charcoal background, orange accent buttons, bold sans-serif headings. | Detailed | Theme only | Agnostic | Polished |
| 25 | [Sparrow & Finch Boutique — Personal Styling Booking](https://docs.google.com/forms/d/e/1FAIpQLScZGzpHWICu1Go3GLlZCIF1CXR0IzD_O9Su1VNNhZoT_fAfwg/viewform) | This is for Sparrow & Finch Boutique — cream background, dusty-rose accents, elegant serif headings. | Detailed | Theme only | Domain-aware | Polished |
| 26 | [Beacon Community — Volunteer Application](https://docs.google.com/forms/d/e/1FAIpQLSf9m1VeoFtFsieszImCaRpTLWUeD3pkh099_llDvEjVMfgbcA/viewform) | Deep teal and warm white palette, rounded cards, friendly rounded sans-serif font. | Detailed | Theme only | Agnostic | Polished |
| 27 | [Apex Esports — Spring Showdown Tournament Registration](https://docs.google.com/forms/d/e/1FAIpQLSf3eRSagSJ7iNypm6o9tAIF9-l-y1BB3fuajg3-OgXgLILxMQ/viewform) | Question by question with a hero image on the left, dark background with neon-green accents and a bold condensed font. | Detailed | Both | Agnostic | Polished |
| 28 | [Kindred Childcare — Enrollment Application](https://docs.google.com/forms/d/e/1FAIpQLSeqmp6EKoC8q__Y6VMcBO1RE454YP2e8dOcr4rNLLGKZZPH3Q/viewform) | This is enrollment for Kindred Childcare — question by question with a cover page showing the title, description and a hero image on the right; soft pastel palette with a friendly rounded font. | Detailed | Both | Domain-aware | Polished |
| 29 | [Flux Design Studio — Project Inquiry](https://docs.google.com/forms/d/e/1FAIpQLSeRJGhMYTevnWi9Lec3wO64aiOjhI-0an4JShMdnyNw7t21RA/viewform) | Single page with a header image, minimal black-and-white with a single electric-blue accent and a modern grotesk font. | Detailed | Both | Agnostic | Polished |
| 30 | [Meadowlark B&B — Reservation Request](https://docs.google.com/forms/d/e/1FAIpQLSc1luv7ZhGYdJvfM62o9W-PgOl76MemwK9m_h7C_hQ7JzJWbg/viewform) | This is the reservation form for Meadowlark B&B — question by question with a header image, warm cream and sage-green palette, classic serif headings. | Detailed | Both | Domain-aware | Polished |

## Definitions

**Detail**

- **Simple** — Loose direction — a basic layout (one question per screen, or a single page) and/or a few mood words. The tool fills in the rest.
- **Detailed** — Precise direction — a complex layout (e.g. hero image beside each question, a cover page) and/or concrete styling (named colours, fonts, background/hero images).

**Layout/theme specified**

- **None** — The prompt pins down neither the layout nor the theme.
- **Layout only** — Specifies the layout (structure) but not the colours/fonts.
- **Theme only** — Specifies the visual theme — colour, font, background, or a hero/header image — but not the layout.
- **Both** — Specifies both the layout and the theme.

**Form context**

- **Agnostic** — A generic instruction that could apply to any form ("make this form clean").
- **Domain-aware** — References what the form is for ("this is a summer-camp signup — make it playful").

**Phrasing**

- **Polished** — A clean, well-formed instruction.
- **Messy** — Casual, natural phrasing (full words, no abbreviations) — how people often actually type.
