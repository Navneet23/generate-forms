# Text Model Picker — Requirements

Status: **Implemented 2026-08-15.** Functionally verified; NOT quality-validated
(no eval A/B has been run across the three models — see "Open work" below).

## Goal

Make the Gemini model used for form generation selectable from the UI, instead of
the hardcoded `MODEL_ID` constant in `app/lib/gemini.ts`.

## Owner decisions (2026-08-15)

| Decision | Choice |
|---|---|
| Models offered | `gemini-3-flash-preview` (current), `gemini-3.6-flash`, `gemini-3.7-flash` |
| `gemini-3.5-flash` | Excluded — deliberately not offered |
| Record the model choice on published forms | No — out of scope; `PublishedForm` is unchanged |
| Default | `gemini-3-flash-preview`, unchanged from before the picker |

## Model IDs — verified against the live API

The 3.6 and 3.7 Flash models are **GA, not preview**. The ids
`gemini-3.6-flash-preview` and `gemini-3.7-flash-preview` do not exist and return
404 from `v1beta`. Verified by querying `GET /v1beta/models` (52 models returned)
on 2026-08-15. All three offered models share 1,048,576 input / 65,536 output
token limits, so the picker introduces no prompt-size regression.

## Design

An item of state that mirrors the existing `imageModel` picker exactly:

```
page.tsx  useState<TextModelId>   →  ChatPanel prop  →  request body
   →  /api/generate  →  generateForm(..., textModel)  →  ai.chats.create({ model })
```

- `TextModelId`, `DEFAULT_TEXT_MODEL` and `TEXT_MODEL_IDS` are exported from
  `app/lib/gemini.ts` as the single source of truth.
- `/api/generate` validates the client-supplied `textModel` against
  `TEXT_MODEL_IDS` and falls back to the default. The request body is
  client-controlled, so an unrecognised id must never reach Gemini.
- Client components inline the union literal rather than importing the type,
  matching how `imageModel` is handled (`app/lib/gemini.ts` imports `fs`/`path`
  and must not be pulled into the client bundle).

## SDK migration (required, not incidental)

The picker alone was not sufficient. `@google/generative-ai` (v0.24.1, deprecated)
cannot drive 3.6/3.7 — every function-calling round-trip returned 400:

1. It sends `functionResponse` parts with role `"function"`, a role removed in that
   model generation (`Role 'function' is not supported`).
2. Retrying with role `"user"` surfaces a second failure: `Function call is missing
   a thought_signature in functionCall parts`. The legacy SDK does not preserve
   thought signatures at all.

Both are resolved by `@google/genai` (v2.17.1), whose `Chat` object retains the
model's own `functionCall` parts — thought signature included — and replays them on
the next turn. `@google/generative-ai` has been removed from `app/package.json`.

Preserved through the migration: the `functionResponse`-then-vision two-message
split (still an SDK constraint), the `announce_plan`-first ordering and its
fallback, the 10-turn history cap, and the QI-4/QI-6 validation retry loop.

## Verification performed (2026-08-15)

Live generations against a real 12-question Google Form (Photography Order Form),
local dev server:

| Model | Result |
|---|---|
| `gemini-3-flash-preview` | 29,534 B HTML, 20 `entry.*` inputs, footer present, validator clean |
| `gemini-3.6-flash` | 26,560 B HTML, 20 `entry.*` inputs, footer present, validator clean |
| `gemini-3.7-flash` | 25,632 B HTML, 20 `entry.*` inputs, footer present, validator clean |

Image path re-verified separately on `gemini-3.7-flash` (it is the code path the
text-only runs never reach): `generate_image` → Vercel Blob upload → vision
follow-up (`color_match`) → CDN URL embedded in the HTML, zero image errors.

Gates: `npx tsc --noEmit` clean, `npm run build` clean, `npm run lint` unchanged at
8 pre-existing issues with none added.

## Open work

- **No eval A/B across models.** The SI is tuned against `gemini-3-flash-preview`,
  and question-text drift (DR-3) is the standing weak point. One generation per
  model proves the plumbing, not output quality. Before recommending 3.6 or 3.7 as
  a new default, run the eval set per `forms-restyler-validation-and-qa`.
- **Model choice is not recorded on published forms** (owner decision above), so a
  published form cannot be attributed to the model that produced it. Worth
  revisiting if model comparison becomes an eval workflow.
