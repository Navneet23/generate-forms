---
name: forms-restyler-failure-archaeology
description: Load before re-investigating any bug in the Forms AI Restyler repo, before proposing a fix that might be a settled battle, or whenever a symptom feels familiar ("didn't we already chase this?", "wrong model ID", "footer looks off", "question text got reworded", "Vercel 401", "OAuth access_denied", "mobile spacing is huge"). This is the historical record — every major investigation, dead end, rejected approach, and settled decision in this repo, so no one re-spends hours re-deriving a conclusion that already exists. It is NOT live triage (use forms-restyler-debugging-playbook for that) and NOT the drift-elimination project plan (use forms-restyler-drift-elimination-campaign for that).
---

# Forms AI Restyler — Failure Archaeology

The chronicle. If a symptom feels familiar, it probably is — check the index
below before spending an hour re-deriving a conclusion this repo already
reached. Entries are grounded in git history (`git show <sha>`) or in the
retiring team's incident notes at the point they were folded into this skill
library (2026-07-19); each entry says which.

**Format:** `ID | Title | Symptom | Root cause | Evidence | Fix/Decision | Status | Where it lives now`

**Status values:** `resolved` (fixed, done), `open` (known, unresolved, has an
owning campaign), `accepted-limitation` (known, deliberately not fixed further).

## When NOT to use this skill

- Actively debugging something broken right now → **forms-restyler-debugging-playbook**
  (symptom-to-fix triage table, faster path to a live fix).
- Working the question-text-drift problem specifically → **forms-restyler-drift-elimination-campaign**
  (the active project plan; this skill only records that drift is open and why
  prompt-only fixes were rejected as a complete solution).
- Making a change and need process/guardrails → **forms-restyler-change-control**.
- Need the current architecture, not its history → **forms-restyler-architecture-contract**
  or `documentation/architecture.md`.

This skill is a *record*, not a *procedure*. If you came here to fix something,
find the matching entry, note its "Where it lives now" pointer, then go there.

---

## Index

### Section A — Pre-session era (mined from git history, Feb–May 2026)

| ID | Title | Status |
|---|---|---|
| PRE-1 | Multi-step UX + screenshot overlay blocking interaction | resolved |
| PRE-2 | The 8-bug MVP/V2 bundle (`bugs_and_fixes.md`) | resolved (doc retired) |
| PRE-3 | Wrong Gemini text-model ID at deploy prep | resolved |
| PRE-4 | Image generation broken: wrong model ID + SDK part-mixing constraint | resolved |
| PRE-5 | Vercel preview 401 on internal self-fetch | resolved |
| PRE-6 | Vercel root-directory misconfiguration | resolved |
| PRE-7 | Generation-timeline UI bugs (numbering, stuck spinner, template steps) | resolved |
| PRE-8 | Question-text drift: prompt-strengthening attempt | resolved-partial (see INC-9) |
| PRE-9 | Question-text drift documented as a known limitation | accepted-limitation (see INC-9) |

### Section B — Session era (eval-set build, incidents INC-1..INC-20, ~2026-07-18/19)

| ID | Title | Status |
|---|---|---|
| INC-1 | OAuth 403 access_denied from a mismatched GCP project | resolved |
| INC-2 | `forms.forms.setPublishSettings is not a function` | resolved |
| INC-3 | Unknown CLI flag silently ran the full batch | resolved |
| INC-4 | `--force` on a completed item recreated its Google Form | resolved |
| INC-5 | Prod-SI near-miss on eval generation | resolved |
| INC-6 | Submit URL baked from the generating origin | resolved (known behaviour) |
| INC-7 | Mobile footer/white-space hunt (four independent causes) | resolved |
| INC-8 | Footer fidelity (logo glyph, dropped required links) | resolved |
| INC-9 | Question-text drift | **open** |
| INC-10 | Thin extraction on one-question-at-a-time SPAs | accepted-limitation |
| INC-11 | Eval verify failed on `&` in question text | resolved |
| INC-12 | Single-option choice questions rejected by Forms API | resolved |
| INC-13 | Vercel preview 401 on internal self-fetch (eval-time recurrence) | resolved |
| INC-14 | `srcdoc` iframe null origin → CORS preflight | resolved |
| INC-15 | Wedged dev server on port 3000 | resolved (operational) |
| INC-16 | Gemini SDK: `functionResponse` can't mix with other part types | resolved (known constraint) |
| INC-17 | Transient Gemini 503s during batch generation | accepted (not a bug) |
| INC-18 | Zero-image generations are intended | accepted (not a bug) |
| INC-19 | Google Drive MCP connector limits | accepted limitation |
| INC-20 | Shell traps in the agent environment | resolved (operational) |

### Section C — Settled design battles

| ID | Decision |
|---|---|
| DEC-1 | Bracket-depth walker over regex for `FB_PUBLIC_LOAD_DATA_` extraction |
| DEC-2 | Direct shared-lib call over HTTP self-fetch between API routes |
| DEC-3 | Local-generation-with-URL-rewrite over prod generation for evals |
| DEC-4 | Canonical interpolated footer over "describe the footer" prompting |

### Section D — Open / accepted items registry

| ID | Item | Status |
|---|---|---|
| OPEN-1 | Question-text drift | open — see INC-9 / PRE-8 / PRE-9 |
| ACC-1 | Thin extraction | accepted-limitation — see INC-10 |
| ACC-2 | Screenshot-on-prod reliability limits | accepted-limitation |
| ACC-3 | Extend-endpoint authorization = knowledge of form id | accepted (prototype) |
| ACC-4 | Pre-feature Blob cleanup out of scope | accepted (deliberate scope cut) |

---

## Section A — Pre-session era

### PRE-1 | Multi-step UX + screenshot overlay blocking interaction
**Symptom:** After the first AI generation, the creator could not click, scroll,
or interact with the generated form in the preview pane — every hover showed a
crosshair cursor.
**Root cause:** The screenshot-selection overlay (`position: absolute; inset: 0`)
was always rendered on top of the generated iframe, capturing all mouse events.
There was no way to interact with the form without disabling the overlay.
**Evidence:** commit `a3e67f0` ("Fix multi-step form UX and screenshot overlay
blocking interaction", 2026-02-22 10:58). Diff touches `app/app/page.tsx`,
`app/components/ChatPanel.tsx`, `app/components/PreviewPane.tsx`,
`app/lib/gemini.ts`.
**Fix:** Made screenshot mode opt-in via a crop button in the chat toolbar;
the overlay only mounts when `screenshotMode` is explicitly true. Also added
SI rules for question-by-question forms in this same commit: mandatory review
step, auto-advance on single-selection questions, Enter-key navigation,
full-viewport background colour.
**Status:** resolved.
**Where it lives now:** `app/components/PreviewPane.tsx` (`screenshotMode` prop),
`app/components/ChatPanel.tsx` (toolbar crop button).

### PRE-2 | The 8-bug MVP/V2 bundle (`bugs_and_fixes.md`)
**Symptom:** `documentation/bugs_and_fixes.md` was deleted in commit `8544d3c`
("Remove bugs_and_fixes.md — all 8 bugs resolved", 2026-02-22 11:00) once every
bug it tracked was closed. The file no longer exists on disk but is fully
recoverable via `git show 8544d3c^:documentation/bugs_and_fixes.md`. Retelling
it here so the history isn't lost with the file:

| # | Symptom | Root cause | Fix |
|---|---|---|---|
| 1 | Published URL doubled the origin (`http://localhost:3000http://localhost:3000/f/abc123`) | Publish API already returns the full URL; frontend also prepended `window.location.origin` | Use `publishedUrl` directly, drop the frontend prefix (`app/app/page.tsx`) |
| 2 | Form title rendered as "C", description as "u" | Two compounding bugs: (a) non-greedy regex `\[[\s\S]*?\]` stopped at the first `]` in nested JSON, before the bracket-depth walker existed; (b) normaliser indexed `meta[8][0]`/`meta[8][1]` — but `meta[8]` and `meta[0]` are plain strings, so `[0]`/`[1]` indexing returned single characters | Replaced regex with the bracket-depth walker; fixed indices to `meta[8]` (title) and `meta[0]` (description) (`lib/scraper.ts`) |
| 3 | Form submission failing from the preview pane ("An error occurred") | AI-generated form runs in a `srcdoc` iframe, which has a null/opaque origin; `fetch()` to the submit API triggered a CORS preflight that Next.js routes didn't answer | Explicit CORS headers + `OPTIONS` handler on `/api/submit/[formId]/route.ts` |
| 4 | Linear-scale labels rendered on a separate row, offset from the numbers | No explicit instruction to the model on linear-scale layout | Added SI rule 9: single horizontal row, min/max labels aligned under the endpoints (`lib/gemini.ts`) |
| 5 | Next.js dev-mode "N" badge overlapping the Publish button | Next.js 16 shows a dev indicator by default | `devIndicators: false` in `next.config.ts` |
| 6 | Multi-step form submit returned HTTP 500 on the final review page | Not the proxy — the AI-generated form's own JS: (a) checkbox values sent as a comma-joined string instead of an array, which Google Forms rejects; (b) a successful Forms POST returns a 302, which `fetch(..., {redirect:"manual"})` reports as status `0`, which the proxy was treating as an error | Proxy: accept arrays per field, appended individually to `URLSearchParams`; treat status `0` as success; SI rule 5 explicitly requires checkbox values as a JSON array |
| 7 | Screenshot overlay blocking all interaction | See PRE-1 | See PRE-1 |
| 8 | Missing/empty review step, no auto-advance on single-select questions, plain white background | SI had no rules for these behaviours | SI rules 11–12: full-viewport background, mandatory review step, auto-advance with helper text, Enter-to-advance (except inside `<textarea>`) |

**Fix/Decision:** Once all 8 were closed, the tracking doc was deleted rather
than kept as a growing changelog — the project's practice is architecture docs
and requirements docs as the record, not a standing bug log.
**Status:** resolved; doc intentionally retired, content preserved only in git
history (recoverable via the command above).
**Where it lives now:** fixes live in `app/lib/scraper.ts`, `app/lib/gemini.ts`,
`app/app/api/submit/[formId]/route.ts`, `app/components/PreviewPane.tsx`,
`next.config.ts`. No standing bug-log file — see instead
`documentation/architecture.md` and `requirements/quality_improvements.md`.

### PRE-3 | Wrong Gemini text-model ID at deploy prep
**Symptom:** Deploy-prep pass caught a stale model identifier before it shipped.
**Root cause:** `MODEL_ID` in `app/lib/gemini.ts` was set to `"gemini-3.0-flash"`,
which is not the correct API model identifier.
**Evidence:** commit `6f80177` ("Fix Gemini model ID to gemini-3-flash-preview",
2026-02-22 11:33), immediately following `0f812dd` ("Upgrade to Gemini 3.0
Flash…") and immediately preceding `bf14675` ("Deploy prep: Upstash Redis,
scraper type fix, model guardrails") in the same session — i.e. this was caught
and fixed as part of getting the app ready to deploy.
**Fix:** `MODEL_ID = "gemini-3-flash-preview"` in `app/lib/gemini.ts`; doc
string in `documentation/architecture.md` updated to match.
**Status:** resolved.
**Where it lives now:** `const MODEL_ID` near the top of `app/lib/gemini.ts`
(currently `"gemini-3-flash-preview"` as of 2026-07-19 — verify with
`grep MODEL_ID app/lib/gemini.ts` since text-model choice can change).

### PRE-4 | Image generation broken: wrong model ID + SDK part-mixing constraint
**Symptom:** AI image generation failed outright after being added.
**Root cause:** Two independent bugs in the same feature: (a) the image model
ID `gemini-2.0-flash-exp` returned 404 — wrong identifier; (b) the Gemini SDK
rejects a message that mixes a `functionResponse` part with any other part
type ("FunctionResponse cannot be mixed with other type of part").
**Evidence:** commit `645c0ad` ("Fix image generation: correct model ID and
split function response messages", 2026-02-22 18:57). Diff:
`app/app/api/generate-image/route.ts` (+4/-2), `app/lib/gemini.ts` (+31/-19 net
16 lines).
**Fix:** Model ID corrected to `gemini-2.5-flash-image`; `responseModalities`
changed to uppercase `["TEXT", "IMAGE"]` per API spec; the `functionResponse`
for the image call and the follow-up vision `inlineData` (the generated image
sent back to Gemini so it can see what it made) are now split into two
separate `sendMessage` calls instead of one.
**Status:** resolved; the part-mixing constraint is a permanent SDK behaviour,
not something to "fix" again.
**Where it lives now:** `app/lib/gemini.ts` (the two-message pattern around
image function calls) — cross-referenced in `documentation/architecture.md`'s
function-calling flow section. Also recorded as INC-16 in Section B since it
recurred as a fact worth restating during the session.

### PRE-5 | Vercel preview 401 on internal self-fetch
**Symptom:** `/api/generate` calling `fetch("/api/generate-image")` returned
401 on Vercel preview deployments.
**Root cause:** Vercel preview deployments have deployment protection that
blocks unauthenticated requests to the same deployment — an internal
same-origin `fetch()` doesn't carry the auth Vercel expects, so it's rejected
like an external request.
**Evidence:** commit `9c0a1a3` ("Extract image generation to shared lib, fix
Vercel preview 401", 2026-02-22 20:37). Diff: `app/lib/image-gen.ts` created
(+86 new file), `app/app/api/generate-image/route.ts` (-113, now a thin
wrapper), `app/app/api/generate/route.ts` (-19), `app/lib/gemini.ts` (+9/-… ).
**Fix:** Extracted image-generation logic into `app/lib/image-gen.ts` and
called it as a plain function from `/api/generate`, instead of routing through
HTTP. The standalone `/api/generate-image` route now also delegates to the
same shared lib. This is DEC-2 below — treat as settled, don't reintroduce
self-fetch between routes.
**Status:** resolved.
**Where it lives now:** `app/lib/image-gen.ts`; documented in
`documentation/architecture.md` line ~250 ("Why a shared lib instead of HTTP
self-fetch").

### PRE-6 | Vercel root-directory misconfiguration
**Symptom:** Vercel builds weren't picking up the app correctly.
**Root cause:** Vercel project's configured root directory didn't match where
the Next.js app actually lives (`app/`).
**Evidence:** commit `a972970` ("Trigger rebuild with correct root directory",
2026-05-04 20:00, author `Navneet23`). The commit is an intentional empty
commit (`git diff a972970^ a972970` produces no file changes) — its only
purpose was to force a new Vercel deployment after the dashboard root-directory
setting was corrected outside git.
**Fix:** Corrected the Vercel project setting (Vercel dashboard, not in this
repo) to point at `app/`; pushed an empty commit to trigger a fresh build.
**Status:** resolved.
**Where it lives now:** no file artifact — this is a hosting-config fact.
Vercel prod URL is `https://app-red-phi-88.vercel.app`, building from `main`,
root directory `app/`. If a Vercel build ever silently fails to reflect a
merge, check the dashboard root-directory setting before assuming a code bug.

### PRE-7 | Generation-timeline UI bugs (numbering, stuck spinner, template steps)
**Symptom:** Four bugs in the SSE-driven generation-progress timeline UI: image
step numbers were inflated mid-loop, a `html_gen` completion event was
sometimes missing (leaving a spinner stuck), steps weren't shown upfront as a
template, and image-type labels were missing from step text.
**Root cause:** Image index was computed live during the loop instead of from
a pre-loop snapshot count, so it inflated as images completed; the
`html_gen/completed` event was never emitted after HTML extraction in some
paths; steps were only added to the timeline as they started, not shown
pending upfront.
**Evidence:** commit `cc0b771` ("Fix timeline bugs: image numbering, stuck
spinner, template steps, image type labels", 2026-05-06 13:32). Diff:
`app/components/ChatPanel.tsx` (+136/-…), `app/components/TimelineMessage.tsx`
(+112/-…), `app/lib/gemini.ts` (+8/-…).
**Fix:** Image index computed from a snapshot count taken before the image
batch starts; added the missing `html_gen/completed` event; all steps
(analyze, plan, images, colors, HTML) shown upfront as a pending template;
image/color steps marked "skipped" when no images are generated; added
pending (gray circle) and skipped (dash) status icons; image type
(header/background/accent) shown in step labels; click-to-expand full image
prompt.
**Status:** resolved.
**Where it lives now:** `app/components/TimelineMessage.tsx`,
`app/components/ChatPanel.tsx`.

### PRE-8 | Question-text drift: prompt-strengthening attempt
**Symptom:** `announce_plan` function-calling mode was causing Gemini to take
creative liberties with form content — e.g. rewriting "Full Name" as "What's
your name, sugar?".
**Root cause:** The `announce_plan` function description and parameter docs
didn't explicitly forbid content changes, so the model treated "plan" broadly
enough to include rewriting text as part of its creative process.
**Evidence:** commit `f5599da` ("Fix form content rewriting: strengthen prompt
to preserve question text verbatim", 2026-05-06 14:53). Diff (`app/lib/gemini.ts`,
+5/-3) reinforces immutability in three places: the `announce_plan` function
description ("Describe only visual/layout decisions... NEVER include changing
question text"), its `summary` parameter description, and a new end-of-prompt
reminder ("Even if the user asks to 'make it fun'... The text content of
questions, options, title, and description must NEVER change").
**Fix/Decision:** Prompt strengthened in three places as above.
**Status:** resolved-partial — this measurably reduced drift but explicitly
did **NOT** eliminate it (confirmed four days later in PRE-9/commit `3d31325`).
Treat this as the closed chapter on "try harder wording" — see INC-9 for why
further prompt-only iteration is a known-weak path.
**Where it lives now:** `app/lib/gemini.ts`, `announcePlanFunctionDecl` and
the "CRITICAL — PRESERVE FORM CONTENT EXACTLY" block in `buildSystemPrompt()`.

### PRE-9 | Question-text drift documented as a known limitation
**Symptom:** Same drift as PRE-8, still occurring after the prompt strengthening.
**Root cause:** Non-deterministic model behaviour; a retry usually produces
correct output, meaning it isn't a deterministic logic bug that prompt wording
alone can close.
**Evidence:** commit `3d31325` ("Document rare question-text drift as a known
Gemini limitation", 2026-05-10 16:14). Diff: `documentation/architecture.md`
+2 lines, adding: *"Known limitation — rare question text drift: Despite the
system prompt's strong language preserving form text verbatim (reinforced in
commit f5599da), Gemini occasionally paraphrases question text or option
labels... A structural fix (post-generation diff against
structure.questions[].text with auto-retry or auto-correction) is the right
long-term solution but is out of scope."*
**Fix/Decision:** Documented rather than chased further with prompt edits;
named the correct structural fix (post-generation validator) as future scope
instead.
**Status:** accepted-limitation at the time; **reclassified to `open` in
Section B (INC-9)** once the eval-set/campaign work in July 2026 made it the
named target of an active campaign. Both entries are kept: this one is the
historical record of when/why it was first accepted as a limitation.
**Where it lives now:** `documentation/architecture.md`, "Known limitation"
section (search for "question text drift"). Active work tracked in
**forms-restyler-drift-elimination-campaign**.

---

## Section B — Session era (INC-1..INC-20)

These occurred during the eval-set build and SI-revision session that produced
the `si-improvements` branch (commits `d0b8c13`, `9a0726c`, `670a1d0`,
`b8fa8db`, `4ca33a4`, `3900135`, all 2026-07-18, not yet merged to `main` as of
2026-07-19).

### INC-1 | OAuth 403 access_denied from a mismatched GCP project
**Symptom:** `Error 403: access_denied` from Google OAuth when authorizing the
eval tooling's Forms API access — persisted even after adding test users to
the consent screen AND after publishing the consent screen to production.
**Root cause:** The downloaded `client_secret.json` belonged to a *different*
GCP project (OAuth client id prefix `790977785064`) than the `forms-eval`
project whose consent screen was actually being edited (client id prefix
`277948348438`). The consent-screen fixes were real but applied to the wrong
project's client.
**Evidence:** Cloud Console credentials page listed a different client id than
the JSON file on disk; `evals/tools/README.md` records the warning ("a
mismatched client produces `403: access_denied` that no consent-screen change
fixes").
**Fix/Decision:** Download the client JSON from the *same* project as the
consent screen being edited; re-run `npm run auth`.
**Status:** resolved.
**Where it lives now:** `evals/tools/README.md` (OAuth setup section, step
mentioning the desktop-app client and the mismatched-client warning);
credentials themselves in `evals/tools/credentials/` (gitignored).
**Lesson:** when an OAuth error survives a consent-screen fix, diff the
client id in the JSON against the project's client list *first* — don't keep
iterating on consent-screen settings.

### INC-2 | `forms.forms.setPublishSettings is not a function`
**Symptom:** Calling `forms.forms.setPublishSettings` on the `googleapis`
client threw "is not a function".
**Root cause:** The installed `googleapis` version predated the
publish-settings endpoint in its type/method surface.
**Evidence:** `evals/tools/package.json` currently pins `"googleapis":
"^173.0.0"` (verified 2026-07-19); the incident record states the prior
version was `googleapis@144`.
**Fix/Decision:** Upgrade to `googleapis@^173`.
**Status:** resolved.
**Where it lives now:** `evals/tools/package.json`.

### INC-3 | Unknown CLI flag silently ran the full batch
**Symptom:** A subagent ran `node run.mjs --help`; the unknown `--help` flag
was silently ignored by the argument parser, so the orchestrator fell through
to its default behaviour and processed *every* source item — creating
duplicate Google Forms in the user's Drive (e.g. an extra "Atelier Eva" form).
**Root cause:** The CLI argument parser had no "unknown flag" rejection path;
unrecognized args were dropped rather than treated as an error.
**Evidence:** `evals/tools/README.md` states: *"Unknown flags abort the run
(they used to silently mean 'run everything')."* — present tense, describing
the fix.
**Fix/Decision:** `run.mjs` and `generate-restyled.mjs` now abort on any
unrecognized argument instead of falling through to a default.
**Status:** resolved; the orphan Google Forms created during the incident
remain in the user's Drive (harmless but not cleaned up — delete manually if
noticed).
**Where it lives now:** `evals/tools/run.mjs`, `evals/tools/generate-restyled.mjs`
(argument parsing). This is also DR-6/DEC-adjacent: **rule derived — CLI tools
in this repo must fail closed on unknown arguments.** Preserve this property
in any new eval/ops tool.

### INC-4 | `--force` on a completed item recreated its Google Form
**Symptom:** Re-running an item with `--force` after it was already complete
recreated its Google Form from scratch, orphaning the previously
user-approved form and desyncing the doc/manifest. Specific casualty:
`crossfit-virtuosity-feedback` — an unwanted 10-question variant replaced the
user-approved 11-question form.
**Root cause:** `--force` had no awareness of "this item already has a
user-approved artifact" — it unconditionally reran generation and Forms-API
creation for the item.
**Evidence:** manifest shards under `evals/manifest-items/` carry an
`orphanedForm` field specifically for recording superseded variants —
confirms this class of incident was anticipated/handled at the schema level.
**Fix/Decision:** Manifest realigned to the user-approved form via re-scrape;
the shard's `orphanedForm` field records the superseded variant for audit.
**Status:** resolved (for this item); rule derived rather than a code guard:
**never `--force` an item whose form the user has approved — check the
manifest shard first.**
**Where it lives now:** `evals/manifest-items/*.json` (`orphanedForm` field);
rule DR-8-equivalent enforced by discipline, not by tooling — a future
`--force` guard that checks approval state before recreating is not yet built.

### INC-5 | Prod-SI near-miss on eval generation
**Symptom:** The restyled-form generation stage was about to call **prod's**
`/api/generate` for the eval run.
**Root cause:** Prod builds from `main`, and `main` did not (as of this
incident) contain the `si-improvements` SI changes — generating against prod
would have silently evaluated the *old* prompt while everyone believed the
new one was being measured. Caught by the user, not by process.
**Evidence:** `evals/tools/README.md`: *"The LOCAL dev server must be running
(`npm run dev` in `app/`) — generation intentionally targets localhost so the
working-tree system instructions are what gets evaluated. Never point
generation at prod: prod may run an older SI, silently invalidating the
eval."*
**Fix/Decision:** Generation targets the LOCAL dev server (working-tree SI),
then the script rewrites the baked submit URL
(`http://localhost:3000/api/submit/...` → prod origin) before publishing to
prod. `evals/tools/generate-restyled.mjs` throws if the rewrite matches
nothing — see INC-6 for why the URL needs rewriting at all, and DEC-3 for the
full design rationale.
**Status:** resolved; rule enshrined in tooling and docs.
**Where it lives now:** `evals/tools/generate-restyled.mjs` (rewrite +
guard), `evals/tools/README.md`.
**Lesson:** before ANY eval or comparison run, verify which SI/code version
the generating endpoint actually runs. An eval against the wrong SI is
silently worthless — there is no error, just a wrong number.

### INC-6 | Submit URL baked from the generating origin
**Symptom:** N/A — this is a documented mechanism, not a bug in itself, but
it's the reason INC-5's rewrite step exists and is worth knowing as a fact.
**Root cause / mechanism:** `app/app/api/generate/route.ts` builds
`const submitUrl = \`${req.nextUrl.origin}/api/submit/${structure.formId}\`;`
(line 61, verified 2026-07-19) and the SI interpolates this URL verbatim into
the generated HTML's submit logic. Any generation made on `localhost`
therefore produces HTML that submits to `localhost`.
**Evidence:** `app/app/api/generate/route.ts` line 61.
**Fix/Decision:** N/A — this is intended, load-bearing behaviour, not
something to "fix". It's *why* `evals/tools/generate-restyled.mjs` must
rewrite the baked submit URL before publishing eval forms to prod (INC-5).
**Status:** resolved / known behaviour — do not attempt to make submit URLs
origin-independent without redesigning the eval publish flow around it.
**Where it lives now:** `app/app/api/generate/route.ts` (~line 61).

### INC-7 | Mobile footer/white-space hunt (four independent causes)
**Symptom:** On narrow screens, footer text rendered huge and the form card
had excessive white space. Multi-hour root-cause session.
**Root cause:** FOUR independent causes compounding into one visual symptom:
(a) the footer wordmark used `em` sizing, so it inherited the form's display
font scale instead of staying fixed; (b) SI rule 6's "≥16px on mobile"
minimum was being applied to footer/secondary text, inflating it; (c) desktop
padding/margins were fixed pixel values instead of compressing on narrow
screens; (d) step containers used `min-height`/`space-between`, so they
stretched to fill available height rather than sizing to content.
**Evidence:** `requirements/quality_improvements.md` (QI-11 note): *"rule 6
also gained mobile spacing compression + content-sized containers after live
testing on narrow screens"*; commit `9a0726c` diff shows rule 6 amended with
"≤480px" padding compression and "never give them fixed heights, large
min-heights, or space-between stretching" language.
**Fix/Decision:** All fixes landed in `app/lib/gemini.ts`'s SI: the canonical
footer (see INC-8/DEC-4) uses fixed inline px sizes (12px notices, 20px
wordmark) and is explicitly exempted from rule 6's mobile minimum; rule 6
gained a secondary-text exemption, 16–24px horizontal padding on screens
≤480px, and a requirement that cards/steps size to content instead of
stretching.
**Status:** resolved.
**Where it lives now:** `app/lib/gemini.ts`, SI rule 6 (mobile constraints)
and rule 18 (footer, exempted from rule 6); `requirements/quality_improvements.md`
QI-11.
**Lesson:** "looks wrong on mobile" is usually SEVERAL independent causes
layered together — enumerate all of them before patching the first one you
find, or you'll fix one cause and still see the symptom.

### INC-8 | Footer fidelity (logo glyph, dropped required links)
**Symptom:** Early generations showed a Google-Forms-like logo *glyph*
(icon/purple document shape) instead of text, and dropped some of the
required footer links.
**Root cause:** The SI only *described* the footer requirement in prose
(before rule 18 existed as canonical HTML), leaving the model to improvise
the wordmark and possibly omit links under creative pressure.
**Evidence:** the real responder footer, verified against a live Google Form,
has: the "Never submit passwords through Google Forms." notice; "This content
is neither created nor endorsed by Google." with Contact form owner (→ the
original viewform URL), Terms of Service (`policies.google.com/terms`),
Privacy Policy (`policies.google.com/privacy`); "Does this form look
suspicious? Report" (→ `https://docs.google.com/forms/d/e/{formId}/abuse`);
and a GREY TEXT wordmark — "Google" (weight 500) "Forms" (weight 400), 20px,
`#5f6368` — never an icon/image/SVG. Confirmed present in
`app/lib/gemini.ts`'s `buildGoogleFormsFooter()` (added in commit `9a0726c`).
**Fix/Decision:** `buildGoogleFormsFooter(formId)` in `app/lib/gemini.ts`
produces the canonical HTML, interpolated *verbatim* into the SI (not
described in prose), with a `data-gforms-footer` marker attribute for future
programmatic validation. This is DEC-4 below.
**Status:** resolved. `requirements/quality_improvements.md` rubric
Dimension 2 (Groundedness) explicitly checks footer notices + wordmark.
**Where it lives now:** `app/lib/gemini.ts` (`buildGoogleFormsFooter`, SI
rule 18); `requirements/quality_improvements.md` (QI-1, QI-2).

### INC-9 | Question-text drift (OPEN)
**Symptom:** Gemini occasionally paraphrases question text or option labels
despite the SI's verbatim-text rules — e.g. "Rate your current
baking/decorating experience." rendered as "Rate your current experience".
Non-deterministic and infrequent; a retry of the same generation usually
produces correct output.
**Root cause:** Not fully understood — believed to be inherent model
creative-writing pressure interacting with long, rule-heavy prompts; no
single deterministic trigger has been isolated.
**Evidence:** `documentation/architecture.md` "Known limitation" section
(added in `3d31325`, see PRE-9); prompt-strengthening in `f5599da` (PRE-8)
measurably reduced but did not eliminate the issue.
**Fix/Decision:** Prompt-only fixes are a **known-weak path** — treat any
further "strengthen the wording" proposal with suspicion; it was already
tried (PRE-8) and reduced but did not eliminate drift, because
non-deterministic model failures cannot reliably be prompted away. The
structural fix is a post-generation validator: parse generated HTML, diff
question/option text and `entry.*` names against `structure.questions[]`,
auto-retry (bounded) or auto-correct on mismatch. This is QI-4/QI-6 in
`requirements/quality_improvements.md` (both marked "⬜ Not started — Next
major task" as of 2026-07-18).
**Status:** **open** — the active campaign target.
**Where it lives now:** `documentation/architecture.md` ("Known limitation");
`requirements/quality_improvements.md` (QI-4, QI-6); active project plan in
**forms-restyler-drift-elimination-campaign**. Do not re-litigate whether
prompt-strengthening alone can solve this — that question is answered (no).

### INC-10 | Thin extraction on one-question-at-a-time SPAs
**Symptom:** For SPA-based form tools (Typeform, Fillout, Paperform) that
render only their welcome screen server-side, the eval pipeline's scrape step
captures too little real content, so the Gemini recreation step infers a
plausible question set instead of extracting the actual one.
**Root cause:** Puppeteer-based scraping only sees what's rendered without
JS-driven step navigation; one-question-at-a-time tools intentionally hide
later questions behind client-side interaction the scraper doesn't perform.
**Evidence:** `evals/tools/README.md`: *"Thin extraction (`thinExtraction`
flag): one-question-at-a-time SPAs (Typeform, Fillout, Paperform) often render
only their welcome screen text, so Gemini infers a plausible question set...
14/37 items were thin in the initial run."*
**Fix/Decision:** Accepted by the user — the eval goal is "similar, not
exact" recreation, not pixel/content-perfect extraction. Not fixed; flagged
for awareness instead.
**Status:** accepted-limitation. These 14/37 items have the lowest source
fidelity — review them first when auditing eval quality.
**Where it lives now:** `evals/manifest-items/*.json` (`thinExtraction`
field); `evals/tools/README.md`.

### INC-11 | Eval verify failed on `&` in question text
**Symptom:** The eval pipeline's verify step failed to find question text
that was visibly present on the page.
**Root cause:** Google encodes `&`, `<`, `>` as HTML entities inside the
`FB_PUBLIC_LOAD_DATA_` blob; a straight substring match against the original
question text (with a literal `&`) doesn't match the encoded form.
**Evidence:** `evals/tools/lib/verify.mjs` (verified 2026-07-19): a
`candidates()` function generates encoding variants of a question text,
including `s.replace(/&/g, "&amp;")`, with a comment noting Google "may use
`&amp;` — accept any of them."
**Fix/Decision:** `candidates()` checks all encoding variants of each
question text before declaring a mismatch.
**Status:** resolved.
**Where it lives now:** `evals/tools/lib/verify.mjs`.

### INC-12 | Single-option choice questions rejected by Forms API
**Symptom:** Google Forms API rejected some Gemini-generated question
structures during eval recreation.
**Root cause:** Gemini sometimes emits consent-style items (e.g. "I agree to
the terms") as a 1-option `multiple_choice` or `dropdown` question. Google
Forms requires ≥2 options for those types, but allows exactly 1 option for
`checkboxes`.
**Evidence:** `evals/tools/lib/recreate.mjs` (verified 2026-07-19), lines
~86-100: comment *"Gemini sometimes emits consent/acknowledgement items as a
1-option multiple_choice or dropdown — coerce to checkboxes, where 1 option is
legal,"* followed by a coercion block and a minimum-option-count check keyed
by type.
**Fix/Decision:** Coerce 1-option `multiple_choice`/`dropdown` questions to
`checkboxes` before submitting to the Forms API.
**Status:** resolved.
**Where it lives now:** `evals/tools/lib/recreate.mjs`.

### INC-13 | Vercel preview 401 on internal self-fetch (eval-time recurrence)
**Symptom:** Same class of failure as PRE-5 — `/api/generate` calling
`fetch("/api/generate-image")` got 401 on preview deployments due to
deployment protection.
**Root cause:** Same as PRE-5 (Vercel deployment protection blocking
same-origin unauthenticated requests).
**Evidence:** Same fix already in place (`app/lib/image-gen.ts`); this entry
exists because the session re-confirmed the shared-lib pattern still holds
and is the correct pattern going forward.
**Fix/Decision:** Shared lib (`app/lib/image-gen.ts`) called directly — never
self-fetch between routes. See DEC-2.
**Status:** resolved (structural, permanent).
**Where it lives now:** `app/lib/image-gen.ts`;
`documentation/architecture.md`.

### INC-14 | `srcdoc` iframe null origin → CORS preflight
**Symptom:** Generated forms, which run inside `srcdoc` iframes, failed to
submit even to `localhost`.
**Root cause:** Browsers treat `srcdoc` iframe content as having a null
(opaque) origin, so even a same-host `fetch()` triggers a CORS preflight
`OPTIONS` request — which needs an explicit response.
**Evidence:** `app/app/api/submit/[formId]/route.ts` (verified present,
2026-07-19) handles `OPTIONS` explicitly and returns
`Access-Control-Allow-Origin: *` on all responses. This is the same root
cause as PRE-2's Bug 3 — restated here because it's a recurring gotcha
whenever the submit route is touched.
**Fix/Decision:** Explicit `OPTIONS` handler + CORS headers on all submit-route
responses.
**Status:** resolved.
**Where it lives now:** `app/app/api/submit/[formId]/route.ts`.

### INC-15 | Wedged dev server on port 3000
**Symptom:** New `next dev` instances failed to start, with confusing errors.
**Root cause:** A stale `next dev` process held port 3000 and the
`.next/dev` lock file.
**Evidence:** operational incident, not code-evidenced.
**Fix/Decision:** `lsof -ti :3000 | xargs kill`, then restart.
**Status:** resolved (operational — recheck if it recurs, don't assume it's
fixed forever).
**Where it lives now:** no file; procedural knowledge only.

### INC-16 | Gemini SDK: `functionResponse` can't mix with other part types
**Symptom:** N/A directly (see PRE-4 for the original discovery) — restated
here as a load-bearing constraint worth knowing independent of that specific
bug.
**Root cause:** The Gemini SDK rejects a message containing a
`functionResponse` part alongside any other part type (e.g. `inlineData`
vision input) in the same `sendMessage` call.
**Evidence:** commit `645c0ad` (see PRE-4); documented in
`documentation/architecture.md`'s function-calling flow section.
**Fix/Decision:** Generated images are sent back to Gemini as vision input in
a SEPARATE follow-up message, never combined with the `functionResponse` that
reports the image-generation call's result.
**Status:** resolved / known permanent constraint — do not attempt to
combine these in one message when touching image-generation code.
**Where it lives now:** `app/lib/gemini.ts` (image function-calling flow);
`documentation/architecture.md`.

### INC-17 | Transient Gemini 503s during batch generation
**Symptom:** During the 68-generation eval run (34 items × 2 image-model
configs), 2 generations failed with 503 Service Unavailable.
**Root cause:** Transient upstream Gemini API unavailability — not a code bug.
**Evidence:** `evals/tools/README.md`: *"Transient Gemini 503s happen; a
single rerun of the same command resumes and usually recovers."*
**Fix/Decision:** No code fix; the generation pipeline is resumable from the
manifest, so re-running the same command picks up where it left off.
**Status:** accepted — expected and planned for, not something to chase.
**Where it lives now:** `evals/tools/generate-restyled.mjs` (resumable
per-config design); `evals/tools/README.md`.

### INC-18 | Zero-image generations are intended
**Symptom:** 5 of 34 eval items (fillout-onboarding-survey, fillout-software-survey,
jotform-teacher-evaluation, tally-feature-request, tally-user-research) produced
0 images in BOTH image-model configs, which could look like a failure.
**Root cause:** N/A — not a bug. The SI deliberately tells Gemini that plain
surveys don't need images, and Gemini correctly declined to generate any for
these items.
**Evidence:** design intent recorded in the session; consistent with SI
image-generation guidance in `app/lib/gemini.ts` (conditional image rules,
introduced in commit `a2c9485`, "Conditionally include image guidelines in
system prompt").
**Fix/Decision:** None needed. For these 9 rows, A-vs-B image-config
comparison measures generation *variance*, not image-model quality — keep
that distinction in mind when reading eval results for these items.
**Status:** accepted — do not "fix" this by forcing image generation.
**Where it lives now:** `app/lib/gemini.ts` (conditional image guidance);
`evals/manifest-items/*.json` (per-item image counts).

### INC-19 | Google Drive MCP connector limits
**Symptom:** Regenerating the eval-set Google Doc created a *new* file (v1 →
v2) instead of updating the existing one; Paperform style-guide images pasted
into the doc by the user could not be extracted programmatically.
**Root cause:** The Google Drive MCP connector available in this environment
can CREATE docs (HTML → native Doc conversion via
`evals/tools/generate-doc.mjs`) but cannot EDIT an existing doc, and cannot
extract user-pasted images out of an existing doc.
**Evidence:** operational/tooling limitation, observed directly during the
session; consistent with `evals/tools/generate-doc.mjs` only having a create
path.
**Fix/Decision:** Accepted: regenerating the eval doc mints a new versioned
file rather than updating in place; the 3 Paperform items' corrected
style-guide PNGs must be supplied by the user manually into
`evals/style-guides/` rather than extracted from the doc.
**Status:** accepted limitation.
**Where it lives now:** `evals/tools/generate-doc.mjs` (create-only);
`evals/style-guides/` (where user-supplied PNGs land). Cross-reference:
DR-12-equivalent — don't regenerate the shared eval doc without need; old
versions are left intact rather than deleted.

### INC-20 | Shell traps in the agent environment
**Symptom:** Two recurring environment gotchas during the session: (a)
background shells sometimes started in `app/` rather than the repo root,
causing relative-path commands to fail confusingly; (b) heredoc-style commit
messages broke on quoting in some shell contexts.
**Root cause:** (a) working-directory inheritance in background shell
invocations isn't always the repo root; (b) heredoc quoting inside certain
command-execution wrappers doesn't survive intact.
**Evidence:** operational, observed directly.
**Fix/Decision:** (a) use absolute paths or an explicit `cd` in background
commands rather than assuming repo-root cwd; (b) write commit messages to a
temp file and use `git commit -F <file>` instead of an inline heredoc.
**Status:** resolved (operational discipline, not a code fix).
**Where it lives now:** no file; procedural knowledge for anyone scripting
against this repo from an agent harness.

---

## Section C — Settled design battles

### DEC-1 | Bracket-depth walker over regex for `FB_PUBLIC_LOAD_DATA_` extraction
**Decision:** Extract Google Forms' embedded `FB_PUBLIC_LOAD_DATA_` JSON by
walking the string character-by-character and tracking `[`/`]` nesting depth,
not by regex.
**Why the alternative was rejected:** A non-greedy regex (`\[[\s\S]*?\]`)
stops at the *first* closing bracket, which in deeply nested JSON is an inner
array's closer, not the outer array's — this produced the "title renders as
'C'" bug (PRE-2, Bug 2). A greedy regex over-captures across multiple
top-level structures. Only a depth-aware walker correctly finds the matching
outer bracket.
**Evidence:** `documentation/architecture.md` line ~133: *"Extraction method:
bracket-depth walker (not regex). Walks character-by-character tracking `[` /
`]` depth to find the full JSON array. A non-greedy regex (`\[[\s\S]*?\]`)
fails on nested arrays because it stops at the first `]`."*
**Where it lives now:** `app/lib/scraper.ts` (`scrapeForm()`);
`documentation/architecture.md`.

### DEC-2 | Direct shared-lib call over HTTP self-fetch between API routes
**Decision:** Route handlers that need another route's logic (specifically
`/api/generate` needing image generation) call a shared library function
directly (`app/lib/image-gen.ts`), never `fetch()` the other route over HTTP.
**Why the alternative was rejected:** Vercel preview deployments enforce
deployment protection that blocks unauthenticated requests to the same
deployment — an internal same-origin `fetch("/api/generate-image")` gets a
401 exactly like an external caller would. This broke image generation on
every preview deploy (PRE-5, recurring as INC-13).
**Evidence:** `documentation/architecture.md` line ~250: *"Why a shared lib
instead of HTTP self-fetch: Vercel preview deployments have deployment
protection that blocks unauthenticated requests to the same deployment. An
internal fetch('/api/generate-image') from /api/generate would get a 401.
Calling the function directly avoids this entirely."*
**Where it lives now:** `app/lib/image-gen.ts`, called from both
`app/app/api/generate/route.ts` and `app/app/api/generate-image/route.ts`.

### DEC-3 | Local-generation-with-URL-rewrite over prod generation for evals
**Decision:** Eval-set restyled-form generation always targets the LOCAL dev
server (so the working-tree SI is what's measured), then
`generate-restyled.mjs` rewrites the baked submit URL from
`localhost:3000/api/submit/...` to the prod origin before publishing the
result to prod (publish + 1-year extend go to prod because local and prod
share the same Upstash Redis and Vercel Blob store).
**Why the alternative was rejected:** Generating directly against prod's
`/api/generate` would silently evaluate whatever SI is currently deployed on
`main` — which may be older than the SI actually being tested (INC-5's
near-miss). There is no error signal when this happens; the eval just
quietly measures the wrong thing. The rewrite step itself is defended with a
fail-closed guard: it throws if the rewrite pattern matches nothing, rather
than silently publishing an unrewritten (broken) submit URL.
**Evidence:** `evals/tools/README.md`: *"Never point generation at prod: prod
may run an older SI, silently invalidating the eval... the script rewrites
localhost:3000/api/submit/... → prod before publishing and refuses to publish
if the rewrite finds nothing."*
**Where it lives now:** `evals/tools/generate-restyled.mjs`;
`evals/tools/README.md`.

### DEC-4 | Canonical interpolated footer over "describe the footer" prompting
**Decision:** The Google Forms footer is built as literal HTML by a
TypeScript function, `buildGoogleFormsFooter(formId)`, and interpolated
*verbatim* into the system prompt — the model is told to copy it exactly, not
asked to construct a footer from a written description.
**Why the alternative was rejected:** The earlier approach — describing the
required footer content in prose within the SI — produced a Google-Forms-like
logo *glyph* image/icon instead of the real grey text wordmark, and sometimes
dropped required links (INC-8). Natural-language description left too much
room for the model to improvise branding elements it can't reliably
reproduce from words alone. Giving it the exact HTML string to copy removed
that degree of freedom.
**Evidence:** commit `9a0726c` introduces `buildGoogleFormsFooter()` returning
a fixed HTML template (notices, Contact/Terms/Privacy/Report links, the grey
"Google"/"Forms" wordmark spans with explicit inline styles) and SI rule 18
instructing the model to copy it "EXACTLY as given" while only being allowed
to adjust spacing/alignment/font-size/mute-color — never the notice text,
link labels, link URLs, or wordmark. `requirements/quality_improvements.md`
QI-1/QI-2 record this as the implemented fix with a `data-gforms-footer`
marker attribute reserved for a future automated validator.
**Where it lives now:** `app/lib/gemini.ts` (`buildGoogleFormsFooter`, SI
rule 18); `requirements/quality_improvements.md` (QI-1, QI-2).

---

## Section D — Open / accepted items registry

Quick-reference recap of everything NOT fully resolved, so it's found in one
place. Each links back to its full entry above or to the doc that owns it.

### OPEN-1 | Question-text drift
**Status:** open — active campaign target.
**Summary:** See INC-9 (full entry above) and PRE-8/PRE-9 for the rejected
prompt-only fix attempt. Structural fix (post-generation validator, QI-4/QI-6
in `requirements/quality_improvements.md`) not yet started as of 2026-07-18.
**Cross-reference:** **forms-restyler-drift-elimination-campaign** owns the
active plan; do not start independent prompt-tweaking work on this without
reading that skill first — it exists specifically because prompt-only fixes
are a known dead end here.

### ACC-1 | Thin extraction
**Status:** accepted-limitation.
**Summary:** See INC-10 above. 14/37 eval items have inferred (not extracted)
question sets because their source SPA tools only render a welcome screen to
Puppeteer. Accepted because the eval goal is "similar, not exact."
**Cross-reference:** `evals/manifest-items/*.json` (`thinExtraction` flag),
`evals/tools/README.md`.

### ACC-2 | Screenshot-on-prod reliability limits
**Status:** accepted-limitation, with documented remediation options not yet
taken.
**Summary:** The website-screenshot style-guide feature
(`POST /api/screenshot`, Puppeteer-based) works reliably in local dev but is
only "partially working" on Vercel prod: `@sparticuz/chromium`'s ~50MB
compressed binary is close to Vercel's free-tier 50MB function size limit,
page loads can exceed the free-tier 10-second function timeout, and Chromium
is memory-hungry against the free tier's 1024MB limit. On failure the route
returns a `501` telling the user to use image upload instead, which always
works.
**Evidence:** `documentation/screenshot-production.md` (full file), sections
"Why it may fail on Vercel" and "Fallback behaviour."
**Remediation options on record but not implemented:** (A) swap Puppeteer for
an external screenshot API (ScreenshotOne, Urlbox, Microlink) — no binary
dependency; (B) upgrade to Vercel Pro (60s timeout, 3008MB memory, 250MB
function size) — current implementation would likely work unchanged; (C) a
separate long-running screenshot microservice (Railway/Render/Cloud
Run/Lambda container) called over HTTP.
**Cross-reference:** `documentation/screenshot-production.md`;
`app/app/api/screenshot/route.ts`; `app/components/StyleGuideDialog.tsx`.

### ACC-3 | Extend-endpoint authorization = knowledge of form id
**Status:** accepted (prototype-scope decision).
**Summary:** `POST /api/forms/[id]/extend` (bumping a published form's TTL
from 30 days to 1 year) has no auth or token check — anyone who knows the
form id can extend it. This mirrors the whole persisted-forms feature's
identity model: form identity is an anonymous nanoid with no ownership
tracking.
**Evidence:** `documentation/persisted-forms.md` line ~58: *"Authorization is
by knowledge of the form id (no token, no auth). Anyone with the share link
can extend."*; `requirements/persist-generated-forms.md` line ~54:
*"Authorization: knowledge of the form id is sufficient. No auth, no
token."*
**Why accepted:** consistent with the product's prototype scope — published
forms are already accessible to "anyone with the link" by design (the
publish flow itself has no access control), so gating *extension* behind
stronger auth than *viewing/submitting* would be inconsistent, not more
secure.
**Cross-reference:** `documentation/persisted-forms.md`;
`requirements/persist-generated-forms.md`; `app/app/api/forms/[id]/extend/route.ts`.

### ACC-4 | Pre-feature Blob cleanup out of scope
**Status:** accepted (deliberate scope cut, not an oversight).
**Summary:** The orphan-blob sweeper (`app/app/api/cron/sweep-blobs/route.ts`)
only cleans up image blobs uploaded *after* the persist-generated-forms
feature shipped, because only those blobs have their keys recorded on the
form's `imageKeys` field. Images uploaded before the feature existed, whose
form records may have already expired without ever recording `imageKeys`,
are not swept.
**Evidence:** `documentation/persisted-forms.md` line ~50: *"Pre-feature
blobs — images uploaded before this feature shipped, whose form records may
have already expired without ever recording imageKeys. These are out of
scope. To clean them up retroactively would require either listing every
blob (and accepting that the sweeper would delete everything not currently
referenced — including legacy still-live forms whose records lack
imageKeys) or building a one-time migration tool. Neither was in scope."*
**Why accepted:** Both remediation paths (blanket sweep with false-positive
risk against legacy live forms, or a one-time migration tool) were judged not
worth building for this scope; the safer of the two risks (leaving some
orphaned blobs) was chosen over the riskier one (deleting live legacy form
images).
**Cross-reference:** `documentation/persisted-forms.md`;
`app/app/api/cron/sweep-blobs/route.ts`; `app/lib/store.ts`.

---

## Provenance and maintenance

**Written:** 2026-07-19.

**Sources:**
- Git history of this repo (`git log`, `git show <sha>`, `git show
  <sha> --stat`), specifically commits `a3e67f0`, `8544d3c` (and its deleted
  blob recovered via `git show 8544d3c^:documentation/bugs_and_fixes.md`),
  `6f80177`, `645c0ad`, `9c0a1a3`, `a972970`, `cc0b771`, `f5599da`, `3d31325`,
  `9a0726c`, `d0b8c13`.
- Repo docs current as of 2026-07-19: `documentation/architecture.md`,
  `documentation/persisted-forms.md`, `documentation/screenshot-production.md`,
  `requirements/quality_improvements.md`, `requirements/persist-generated-forms.md`,
  `evals/tools/README.md`, `evals/tools/lib/verify.mjs`,
  `evals/tools/lib/recreate.mjs`, `evals/tools/package.json`,
  `app/app/api/generate/route.ts`, `app/lib/gemini.ts`, `app/lib/image-gen.ts`.
- Session incident narrative for Section B (INC-1..INC-20) came from a
  retiring principal's handoff notes describing the eval-set-build session;
  every claim in that narrative that touches a repo file or commit was
  independently re-verified against the repo before being written here.

**Unverifiable / narrative-only:** INC-3's specific orphan form name ("Atelier
Eva"), INC-4's specific item id (`crossfit-virtuosity-feedback`), INC-15, and
INC-20 are operational/session narrative not independently checkable against
repo artifacts — they're recorded as reported, not re-derived.

**Re-verification commands:**
```
git show 8544d3c^:documentation/bugs_and_fixes.md   # recover the 8-bug log
git show 9a0726c -- app/lib/gemini.ts                 # canonical footer decision
git show f5599da -- app/lib/gemini.ts                 # drift prompt-strengthening
grep -n "MODEL_ID" app/lib/gemini.ts                  # current text model (drifts over time)
grep -n "submitUrl" app/app/api/generate/route.ts      # INC-6 mechanism still in place
sed -n '1,40p' requirements/quality_improvements.md    # QI-4/QI-6 status (open item)
```
