# Text Model Picker — Requirements

Status: **Implemented 2026-08-15.** Functionally verified; NOT quality-validated.
An eval pilot across the three models was started 2026-08-15 and stopped early at
9 of 24 generations — see "Eval pilot" below. `gemini-3.7-flash` has an open
availability problem (5/5 attempts returned 503).

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

## Eval pilot — partial run, stopped early (2026-08-15/16)

A pilot was scoped at 8 non-thin eval items × 3 text models × 1 image config
(`gemini-2.5-flash-image` held fixed so the text model is the only variable).
It was **stopped by the owner after 9 of 24 generations**; 5 items never ran.

| Item | `gemini-3-flash-preview` | `gemini-3.6-flash` | `gemini-3.7-flash` |
|---|---|---|---|
| `fillout-checkout` | done | done | **503** |
| `founders-factory-application` | done | done | **503** |
| `colgate-oral-health-quiz` | done | done | **503** |

**Finding — `gemini-3.7-flash` availability.** 3.7 failed every attempt made
against it: 3/3 in this run plus 2/2 in earlier production smoke tests, five for
five, all the identical `503 UNAVAILABLE — "This model is currently experiencing
high demand"`. Over the same period `gemini-3-flash-preview` and `gemini-3.6-flash`
recorded zero failures. The requests are well-formed and the same code path
succeeds on the other two models, so this is Google-side capacity, not a defect
here — but at 5/5 it should not be characterised as transient. A user selecting
3.7 today will frequently hit a generation error, and neither the route nor the
UI retries on 503.

Options if this persists (none actioned — needs an owner decision):
1. Retry-on-503 with backoff in `/api/generate`.
2. Drop 3.7 from the picker until capacity improves.
3. Leave as-is and accept the failure rate, since 3.7 is opt-in.

**No quality conclusion is available.** 6 successful generations across 3 items
is far too little to compare output quality, and no rating pass has been run
against them — `evals/rater_instructions.md` still has never been executed by
anyone. The completed generations are published under composite config keys in
their shards and can be rated later or resumed with `--retry-failed`.

## Open work

- **No eval A/B across models.** The SI is tuned against `gemini-3-flash-preview`,
  and question-text drift (DR-3) is the standing weak point. The pilot above was
  stopped before it could produce a comparable sample. Before recommending 3.6 or
  3.7 as a new default, complete the run and rate it per
  `forms-restyler-validation-and-qa`.
- **`gemini-3.7-flash` reliability** — see the pilot finding above; decide between
  retry-on-503, removing it from the picker, or accepting the failure rate.
- **Model choice is not recorded on published forms** (owner decision above), so a
  published form cannot be attributed to the model that produced it. Worth
  revisiting if model comparison becomes an eval workflow.
