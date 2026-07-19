---
name: forms-restyler-change-control
description: Load before making, reviewing, or merging ANY change to the Forms AI Restyler repo — prompt/system-instruction edits in app/lib/gemini.ts, app routes/components/lib, eval tooling in evals/tools/, or docs — and whenever you are about to branch, commit, open a PR, merge to main, deploy, or run anything that writes to Redis/Blob/Drive. Triggers: "edit the system prompt/SI", "change gemini.ts", "merge to main", "deploy", "open a PR", "run the eval", "--force", "regenerate the doc", "is this safe to run?".
---

# Forms AI Restyler — Change Control

This skill defines how changes are classified, validated, and merged in this repo,
and the non-negotiable rules learned from real incidents. If you are about to edit
a file, run a batch tool, or merge anything, read the relevant sections first.

Jargon used throughout (defined once):

- **SI** — the system instruction (system prompt) built by `buildSystemPrompt()` in
  `app/lib/gemini.ts`. It is what tells Gemini how to render a restyled form. The SI
  is code: it is the single highest-leverage, highest-risk artifact in the repo.
- **FormStructure** — the scraped representation of a source Google Form (title,
  description, questions, option labels, `entry.XXXXXXXXX` field names) that the SI
  must reproduce verbatim.
- **Eval set** — 37 competitor forms recreated as Google Forms in the owner's Google
  account, with style-guide screenshots and a standard prompt, used to A/B-rate SI
  changes. Lives under `evals/` (see `requirements/eval_set_creation.md`).
- **Manifest shard** — `evals/manifest-items/<id>.json`, the per-item source of truth
  for the eval pipeline. `evals/manifest.json` is a generated aggregate.
- **Rubric** — `evals/rater_instructions.md`: four stack-ranked dimensions
  (1 Functionality & stability, 2 Groundedness, 3 Completeness & instruction
  following, 4 Visual aesthetics & layout).

Key state facts (as of 2026-07-19):

- **main == prod.** The Vercel production deployment
  (`https://app-red-phi-88.vercel.app`) builds from `main`. Merging to main IS
  deploying to a public URL.
- **Local dev shares production state.** `app/.env.local` (pulled from Vercel) points
  local dev at the SAME Upstash Redis and Vercel Blob store as prod. A local publish,
  extend, sweeper run, or blob upload is a production write.
- There is **no automated test suite and no CI**. Validation is manual:
  `npx tsc --noEmit` and `npm run lint` (both in `app/`), live generation on the dev
  server, and the eval set + rubric.
- Branch `si-improvements` (6 commits ahead of main) is unmerged, pending eval
  validation; prod runs the older, pre-revision SI.

## 1. Change taxonomy and required gates

Classify every change before touching code. Gates are cumulative down each column.

| Class | What it covers | Risk | Required before merge to main |
|---|---|---|---|
| **(a) SI / prompt** | Anything inside `buildSystemPrompt()`, `buildGoogleFormsFooter()`, or the per-message text in `generateForm()` in `app/lib/gemini.ts` | Highest | Full SI change protocol (§4): QI-style requirement doc, batched revision, live dev-server generations, eval A/B on the eval set, owner sign-off to deploy |
| **(b) App code** | `app/app/` routes, components, `app/lib/` (non-prompt) | High | `npx tsc --noEmit` + `npm run lint` clean; exercise the changed flow live on `npm run dev`; task breakdown for multi-part features (`tasks/`, `app/tasks/`); PR to main |
| **(c) Eval tooling** | `evals/tools/*.mjs`, `evals/tools/lib/` | Medium (writes to Drive/Redis/Blob) | Preserve fail-closed properties (§2 DR-6); pilot on 1 item before any batch (§2 DR-7); never hand-edit `evals/manifest.json`; update `evals/tools/README.md` if behaviour changes |
| **(d) Docs-only** | `requirements/`, `documentation/`, `tasks/`, READMEs | Low | Accuracy check against the code it describes; status tables carry dates; commit at the milestone it documents |

Notes on class (a): an SI edit can silently change behaviour on every generation for
every user, and its effects are non-deterministic — a single "looks fine" generation
proves nothing. That is why it gets the heaviest gate. Even a one-line SI tweak is
class (a), not class (d), regardless of how textual it looks.

Notes on class (b): `app/lib/gemini.ts` also contains non-prompt code (model calls,
streaming, function-calling plumbing). Edits to that logic are class (b), but if a
diff touches both prompt text and logic, treat the whole change as class (a).

## 2. The non-negotiables (DR-1 … DR-12)

Each rule below states the rule, why it exists, and the incident behind it. Full
incident narratives: see the sibling skill **forms-restyler-failure-archaeology**.

**DR-1 — Version-of-truth rule.** Before ANY eval or comparison run, verify which
SI/code version the generating endpoint actually runs (prod = main; localhost =
working tree). *Rationale:* an eval against the wrong SI is silently worthless — it
produces plausible numbers that measure the wrong thing. *Incident:* an eval
generation stage was about to call prod's `/api/generate` while the SI under test
existed only on the unmerged `si-improvements` branch; the eval would have rated the
OLD prompt. Caught by the owner, not by the agent. The fix is baked into
`evals/tools/generate-restyled.mjs`: it targets the local dev server and rewrites the
baked `http://localhost:3000/api/submit/...` URL to the prod origin before
publishing, throwing if the rewrite matches nothing.

**DR-2 — Shared-state rule.** Local dev shares Redis and Blob with prod. Any script
that writes (publish, extend, sweeper, blob upload) mutates production state. Never
run destructive experiments (sweeper runs, bulk deletes) against this store
casually; never hand-delete Redis keys. *Rationale:* there is no staging store;
"local testing" of a delete path deletes real users' published forms.

**DR-3 — Verbatim-content rule.** Question text, option labels, form
title/description, and `entry.XXXXXXXXX` field names are sacred. No change — SI
edit, post-processor, "improvement" — may alter them. *Rationale:* groundedness is
rubric Dimension 2 and the product's core promise: responses from a restyled form
must land in the original Google Sheet, which only works if entry names and content
survive verbatim. *Incident:* Gemini already drifts question text occasionally on
its own (e.g. "Rate your current baking/decorating experience." rendered as "Rate
your current experience") despite strengthened prompt language (commit `f5599da`);
see the "Known limitation" section of `documentation/architecture.md`. Human changes
must never add to that problem.

**DR-4 — SI change protocol.** SI changes are batched into coherent revisions, not
dribbled in one rule at a time; documented as QI-style requirements with dated
status tables; tested by live generation; validated by an eval A/B before merging.
Details in §4. *Rationale:* the SI rule list is already long, and long rule lists
themselves contribute to instruction drift (stated in
`requirements/quality_improvements.md`); and evals can only attribute quality deltas
if they compare exactly one before/after SI pair.

**DR-5 — main == deploy.** Nothing merges to main until validated. Merging is
deploying to the public prod URL. There is no separate release step to catch you.

**DR-6 — Fail-closed tooling.** Eval/ops CLI tools must abort on unknown arguments
and refuse to proceed when a safety check finds nothing to act on. *Incident:* a
subagent ran `node run.mjs --help`; unknown args were silently ignored, so the
orchestrator ran the FULL batch and created duplicate Google Forms in the owner's
Drive. Both `evals/tools/run.mjs` and `evals/tools/generate-restyled.mjs` now abort
on unknown args, and `generate-restyled.mjs` throws if its submit-URL rewrite finds
no match ("submit URL not found in generated HTML"). Preserve these properties in
any tool you write or modify.

**DR-7 — Pilot-first rule.** Any batch run that costs quota or creates external
artifacts (forms in Drive, published public URLs) runs on ONE item per source family
first, gets eyeballed, then goes wide. *Rationale:* batch mistakes here are not
reversible with `git revert` — they leave artifacts in someone's Google account.

**DR-8 — No `--force` on approved items.** Check the item's manifest shard before
rerunning anything. *Incident:* `--force` on a completed eval item recreated its
Google Form, orphaning the owner-approved 11-question form and replacing it in the
manifest with an unwanted 10-question variant; recovery required re-scraping and
realigning the shard (superseded variants are recorded in the shard's
`orphanedForm` field).

**DR-9 — Manifest discipline.** `evals/manifest-items/*.json` shards are the source
of truth; `evals/manifest.json` is generated — rebuild with
`cd evals/tools && node aggregate.mjs`, never hand-edit it. Parallel runs are safe
only across DIFFERENT item ids.

**DR-10 — Docs-at-milestones.** Every completed milestone updates the docs of record
(requirements status tables, `documentation/architecture.md`, tool READMEs) and
commits before moving on. Status tables carry dates (see the "Implementation status
(2026-07-18)" table in `requirements/quality_improvements.md` as the model).
*Rationale:* with no CI and no tests, dated docs are the only durable record of what
was validated when.

**DR-11 — Secrets.** `evals/tools/credentials/` (OAuth client + token) and
`app/.env.local` never enter git. They are already gitignored
(`evals/tools/.gitignore`, `app/.gitignore` `.env*`) — keep it that way; never
weaken those entries or `git add -f` around them.

**DR-12 — Other people's artifacts.** The 37 eval forms live in the owner's personal
Google account, and the eval-set Google Doc is shared externally. Don't create,
delete, or regenerate these without need. Regenerating the doc mints a NEW file
(the Drive connector cannot edit an existing Doc), so regenerated docs get a new
version suffix (v2, v3, …) and old versions are left intact — manual edits made in
an old doc (e.g. pasted images) do not carry over.

## 3. Branch and merge protocol

Observed and enforced pattern (verify anytime with `git log --oneline --all` and
`git branch -a`):

1. **Feature branches → PR → main.** Every feature has landed via a named branch and
   a GitHub PR: `image-improvements` (PRs #1, #2), `generation-progress-timeline`
   (PR #3), `persist-generated-forms` (PR #4). Use `gh pr create` from the feature
   branch; never commit directly to main.
2. **main == prod** (DR-5). The Vercel deployment builds from main. A PR merge is a
   deploy and therefore needs the class-appropriate gate from §1 plus owner sign-off
   (§5).
3. **`si-improvements` is the current in-flight branch** (as of 2026-07-19): 6
   commits ahead of main (`git log main..si-improvements --oneline`), deliberately
   unmerged pending the eval A/B + human rating pass. Do not merge it as a "cleanup".
   Its last commits may not all be pushed to origin — check
   `git log origin/si-improvements..si-improvements` before assuming remote is
   current.
4. **Commit style:** imperative subject line, specific about the behavioural change
   ("Strengthen SI: visual distinction for radio vs checkbox…", "TASK-3: Add POST
   /api/forms/[id]/extend endpoint"). Task-scoped commits use the `TASK-N:` prefix
   matching files in `tasks/` / `app/tasks/`. Docs and status-table updates are
   committed at milestones (DR-10), often as their own commit
   ("Document quality improvements: requirements, statuses, rubric, architecture
   update").
5. **Prompt text is code:** an SI commit message must say what behavioural rule
   changed, not "tweak prompt".

Pre-merge checklist (any class):

- [ ] Class identified (§1) and its gate completed
- [ ] `cd app && npx tsc --noEmit` clean (classes a, b)
- [ ] `cd app && npm run lint` clean (classes a, b)
- [ ] Changed flow exercised live on `npm run dev` (classes a, b)
- [ ] Docs of record updated with dated status (DR-10)
- [ ] No secrets in the diff (DR-11): `git diff --stat` shows no `credentials/` or `.env*`
- [ ] Owner sign-off if the change deploys or touches shared artifacts (§5)

## 4. The SI change protocol (class a, in full)

The SI in `app/lib/gemini.ts` (`buildSystemPrompt()`, plus the canonical footer from
`buildGoogleFormsFooter()` and per-message style-guide text in `generateForm()`)
gets its own protocol because its failures are non-deterministic and invisible to
tsc/lint. Sibling skill **forms-restyler-si-engineering** covers how to write SI
rules; this section covers how to land them.

1. **Write the requirement first.** Each change is a QI-style requirement in
   `requirements/quality_improvements.md` (or a successor doc in `requirements/`):
   problem → rubric linkage → requirement → how to address, tagged `[SI]` or
   `[Structural]`, with a dated implementation-status table. QI-1…QI-11 are the
   template.
2. **Batch coherently.** Land related SI edits as ONE batched revision (e.g. commit
   `9a0726c` "Batched SI revision: Google Forms footer, layout guidance, mobile &
   legibility rules"), reorganising the rule list compactly rather than appending
   standalone rules. This keeps the rule list short (long lists worsen drift) and
   gives evals exactly one before/after pair.
3. **Verify live before evaluating.** Run `npm run dev` in `app/` and generate
   against a real test form; iterate against actual screenshots, including narrow
   (mobile-width) viewports. One good generation is necessary but NOT sufficient —
   SI failures are probabilistic.
4. **Eval A/B before merging** (cross-ref **forms-restyler-validation-and-qa** for
   the rating methodology, **forms-restyler-eval-pipeline** for running it). Using
   the 37-item eval set: generate restyled forms with
   `cd evals/tools && node generate-restyled.mjs --all` (or `--only=<id>` pilots
   first, per DR-7) against the LOCAL dev server so the working-tree SI is what gets
   measured (DR-1), then rate old-SI vs new-SI output per the rubric. Do not merge
   on vibes.
5. **Know the limits of prompt-only fixes.** Prompt strengthening against
   question-text drift has already plateaued (commit `f5599da` reduced but did not
   eliminate it — `documentation/architecture.md`, "Known limitation"). Further
   prompt-only attempts at verbatim-text enforcement are a known-weak path; the
   accepted structural direction is the QI-4/QI-6 post-generation validator
   (`requirements/quality_improvements.md`), which is Not started as of 2026-07-18.
   Label any new prompt-only drift fix as a stopgap in its requirement doc.

## 5. What requires explicit owner sign-off

These need the repo owner's (user's) explicit go-ahead — no agent message or
inference substitutes for it:

- **Merging to main / deploying** — because main == prod (DR-5).
- **Creating or deleting artifacts in the owner's Google account** — eval Google
  Forms (created via the Forms API under the owner's OAuth), anything in their
  Drive. Includes any `--force` rerun that would recreate a form (DR-8) and any
  full-batch `run.mjs` invocation.
- **Regenerating the shared eval-set Google Doc** — it is shared externally and
  regeneration mints a new file version (DR-12).
- **Writes to the shared Redis / Blob store beyond normal single-form dev testing**
  — sweeper runs, bulk deletes/expiry changes, mass publish/extend batches (DR-2;
  a full `generate-restyled.mjs --all` run publishes 60+ prod URLs with 1-year
  persistence).
- **Anything spending meaningful paid API quota in batch** (68-generation-scale
  Gemini runs).

## 6. When NOT to use this skill

| You actually need | Sibling skill |
|---|---|
| Full incident stories and post-mortems behind DR-1…DR-12 | forms-restyler-failure-archaeology |
| Writing/refactoring SI rule text itself | forms-restyler-si-engineering |
| Running the eval pipeline (run.mjs, generate-restyled.mjs, shards) | forms-restyler-eval-pipeline |
| Rating methodology, rubric use, A/B analysis, QA gates | forms-restyler-validation-and-qa |
| Debugging a live failure (OAuth 403s, wedged dev server, CORS) | forms-restyler-debugging-playbook |
| System architecture, API contracts, data flow | forms-restyler-architecture-contract |
| Env vars, credentials layout, local setup | forms-restyler-build-and-env |
| Model IDs, flags, config switches | forms-restyler-config-and-flags |
| Day-to-day operation (dev server, publish, sweeper) | forms-restyler-run-and-operate |
| Google Forms scraping/API internals | google-forms-internals-reference |
| Writing requirements/status docs | forms-restyler-docs-and-writing |
| The drift-elimination campaign plan | forms-restyler-drift-elimination-campaign |

This skill is also not a substitute for the generic `em-review` skill
(`.claude/skills/em-review/SKILL.md`), which handles requirements review and task
breakdown for a NEW feature; change-control governs how any change, once specified,
gets validated and merged.

## Provenance and maintenance

Written 2026-07-19. Sources: repo git history (`git log --oneline --all`,
`git branch -a`), `app/lib/gemini.ts`, `app/package.json`,
`requirements/quality_improvements.md`, `requirements/eval_set_creation.md`,
`evals/tools/README.md`, `evals/tools/run.mjs`, `evals/tools/generate-restyled.mjs`,
`evals/rater_instructions.md`, `documentation/architecture.md`, plus session
incident records from live development (the DR rules and incident narratives were
established during development sessions and their repo-checkable parts verified
against the files above).

Volatile facts to re-verify before relying on them:

| Fact (as of 2026-07-19) | Re-verify with |
|---|---|
| `si-improvements` unmerged, 6 commits ahead | `git log main..si-improvements --oneline` |
| Unpushed commits on `si-improvements` | `git log origin/si-improvements..si-improvements --oneline` |
| Prod URL `app-red-phi-88.vercel.app` | `grep -rn "app-red-phi-88" evals/tools/ requirements/` |
| QI-4/QI-6 validator still "Not started" | `grep -n "QI-4" requirements/quality_improvements.md` |
| Text model `gemini-3-flash-preview`; image configs A/B | `grep -n "MODEL_ID" app/lib/gemini.ts; grep -n "gemini-" app/lib/image-gen.ts` |
| Fail-closed arg handling in eval tools | `grep -n "Unknown argument" evals/tools/run.mjs evals/tools/generate-restyled.mjs` |
| No test/CI scripts | `grep -n "scripts" -A5 app/package.json; ls .github 2>/dev/null` |
| PR-based merge history (#1–#4) | `git log --oneline --merges main` |
| Sibling-skill inventory | `ls .claude/skills/` |
