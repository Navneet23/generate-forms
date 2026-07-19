---
name: forms-restyler-docs-and-writing
description: Load when writing or updating requirements docs, architecture/operational documentation, task breakdowns, status tables, commit messages, or eval-tool READMEs in the Forms AI Restyler repo — or when deciding where a new fact ("we fixed X", "we decided Y", "here's how Z works now") should be written down. Triggers — "write up the requirements for...", "document this feature", "update architecture.md", "add a status table", "break this into tasks", "write the commit message", "where should this go", "update the README", "record this decision/incident".
---

# Forms AI Restyler — Docs and Writing

This skill is about **where a fact lives and what shape the document takes**, not
about the technical content of the Forms AI Restyler system itself. For that,
defer to the sibling skills named in "When NOT to use" below — this skill only
tells you the doctrine and the templates.

## 1. The documentation map (doctrine: one home per fact)

Every fact has exactly one correct home. Do not duplicate a fact across two
docs — cross-reference instead ("see `documentation/architecture.md`").

| Kind of fact | Home | When to write it |
|---|---|---|
| How the system works **right now** (current data flow, components, env vars, known limitations) | `documentation/architecture.md` | Every merged behavioural change. Update the relevant section in the same wave of work that changed the behaviour (see commits `670a1d0`, `ed8e309` — architecture.md updated alongside the feature docs/tasks that changed it). |
| Deep operational detail for one subsystem (state model, schedules, algorithms, manual runbooks) | A dedicated file in `documentation/` — e.g. `persisted-forms.md` (sweeper schedule/algorithm/manual invocation), `screenshot-production.md` (production status, fallback behaviour, options considered) | When a subsystem has enough operational nuance that folding it into architecture.md would bloat it. architecture.md keeps a short pointer/summary; the deep-dive lives in its own file. |
| **What** a feature/improvement should do and **why**, with problem evidence | `requirements/*.md` | Before implementation starts (feeds `em-review`), and updated with a dated status table once implementation lands. Two live sub-patterns — see §2a: the QI-n/FI-n backlog style (`quality_improvements.md`, `future_improvements.md`) and the FR-n feature-spec style (`persist-generated-forms.md`, `eval_set_creation.md`). |
| Execution breakdown of an already-scoped feature (phases, tasks, acceptance criteria, dependencies) | `tasks/<feature>_tasks/PLAN.md` + `TASK-N-<slug>.md` (output of the `em-review` skill) | When a feature is nontrivial enough to need `em-review` (see §5). Note: this repo has one placement inconsistency worth knowing — the generation-progress-timeline feature's breakdown landed in `app/tasks/` (flat, no feature subdir) instead of `tasks/generation_progress_timeline_tasks/`. When you are hunting for "does a task breakdown already exist," check both `tasks/*/` and `app/tasks/`. New breakdowns should follow the `tasks/<feature>_tasks/` convention (matches `tasks/persist_generated_forms_tasks/`, the canonical exemplar) unless told otherwise. Older pre-`em-review` breakdowns (`tasks/MVP_tasks/`, `tasks/V2_tasks/`) use a flatter numbered-slug format without PLAN.md/TASK- prefixes or acceptance criteria — treat as historical, not a template for new work. |
| Eval-tooling operations: setup, running, state model, incident lessons | `evals/tools/README.md` | Every time an eval-tool behaviour, flag, or gotcha changes (e.g. a new guard, a new CLI flag, an incident like OAuth 403 or the `--force` orphan-forms lesson). |
| Distilled knowledge for a future session with no memory of this one (playbooks, contracts, campaign state) | `.claude/skills/forms-restyler-*` | When a lesson is expensive to re-derive from scratch and will recur across sessions — not for one-off facts that belong in the docs above. |
| Ad-hoc facts not fitting any of the above (incident narratives, discipline rules not yet promoted to a skill) | A session dossier (temporary) until promoted into one of the rows above | Never leave load-bearing facts stranded only in a dossier or chat transcript — promote them. |

### Deciding fast

- "Does this change what the system DOES right now?" → `documentation/architecture.md` (+ a deep-dive file if it's operationally heavy).
- "Am I proposing/justifying a change before building it?" → `requirements/*.md`.
- "Am I breaking an already-agreed feature into buildable chunks?" → `tasks/<feature>_tasks/` via `em-review`.
- "Am I recording how to run/operate a tool, or a lesson learned running it?" → the tool's own README (`evals/tools/README.md` is the only one today).
- "Will the next session need this to avoid re-learning it the hard way?" → a skill.

## 2. House templates (structure only — quote it, don't invent a new shape)

### 2a. Requirement doc

Two patterns coexist in `requirements/`; pick based on what you're writing.

**QI-n / FI-n backlog pattern** (`requirements/quality_improvements.md`,
`requirements/future_improvements.md`) — use for a backlog of discrete,
independently-landable improvements against an existing system:

```
# <Project> — <Backlog Name>

## Overview
<what this document covers, and what it was derived from, e.g. "identified by
analysing the evaluation rubric against the current SI">

## Implementation status (YYYY-MM-DD)

| Requirement | Status | Notes |
|---|---|---|
| QI-1 <short name> | ✅ Implemented | <where it landed, any caveat> |
| QI-4 <short name> | ⬜ Not started | <what's next> |

---

## <Grouping heading, e.g. by rubric dimension or priority>

### QI-1: <Title> [SI | Structural]

**Problem:** <what's wrong today, with concrete evidence — a rubric quote, an
observed output, a failing check. Not a vague concern.>

**Requirement:** <what must be true after the fix, stated as a testable
condition>

**How to address:** <concrete implementation approach — file(s), function(s),
the mechanism. Bullet list is fine.>
```

Each item is tagged (`[SI]`, `[Structural]`, etc.) so a reader can see the
blast radius without opening code. The status table is the single place that
answers "is this done" — keep it current, don't let prose and table disagree.

**FR-n feature-spec pattern** (`requirements/persist-generated-forms.md`,
`requirements/eval_set_creation.md`) — use for a single new feature about to
go through `em-review`:

```
# <Feature Name> — Requirements

## Overview
## Goals
## Current State (for context)          <- table: concern | today
## Functional Requirements
### FR1. <name>
### FR2. <name>
## Non-Functional Requirements
### NFR1. <name>
## Out of Scope
## Open Decisions Resolved               <- table: question | decision
```

This pattern skips the per-item status table — status instead lives in the
`tasks/<feature>_tasks/` breakdown (each TASK file has its own `## Status`
field) or, once work is underway, gets folded back into this doc as an added
status section if the feature accretes follow-up work (compare how
`eval_set_creation.md` grew a `## Status: COMPLETE` line plus a "Remaining"
section once its em-review tasks were mostly done).

### 2b. Task breakdown (output of `em-review`; exemplar: `tasks/persist_generated_forms_tasks/`)

`PLAN.md`:

```
# Implementation Plan: <Feature>

## Overview
<1 paragraph; total tasks; total phases; pointer to the authoritative
requirements doc>

## Phases Table
| Phase | Name | Tasks | Description |

## Dependency Graph
<ASCII graph of TASK-N -> TASK-M edges>

## Critical Path
<the chain that determines minimum timeline, numbered and explained>

## Risk Mitigation Mapping
| Risk | Severity | Mitigation | Related Tasks |

## Out of Scope (per requirements doc)
```

Each `TASK-N-<slug>.md`:

```
# TASK-N: <Clear, actionable title>

## Status
<Not started | In progress | Done>

## Phase
## Priority
P0 — must have / P1 — should have / P2 — nice to have

## Description
<2-5 sentences: what and why>

## Requirements
<bullet list>

## Acceptance Criteria
- [ ] <concrete, verifiable condition>
- [ ] <cite exact file:line where feasible, e.g. "TTL_SECONDS at
  app/lib/store.ts:14 is 30 * 24 * 60 * 60">

## Technical Notes
<file paths, functions, constraints>

## Dependencies
<TASK numbers, or "None">

## Estimated Effort
Trivial (< 1 hour) / Small (< 1 day) / Medium (1-2 days) / Large (2-3 days)
```

Acceptance criteria should be checkable by reading a diff or running a command
— "TTL_SECONDS is `30 * 24 * 60 * 60`" not "TTL is increased."

### 2c. Ops README (exemplar: `evals/tools/README.md`)

```
# <Tool Name>

<1-2 sentence purpose, pointer to the requirements doc it implements>

## Files
| File | Purpose |

## State model
<what's source of truth, what's generated/derived and how to rebuild it,
what makes concurrent/parallel runs safe>

## One-time setup
<numbered steps>

## Running
<command block with flag table/comments>

## Known behaviours & lessons (<month year> run)
- **<Behaviour name>**: <what happens, why, what to do about it>
```

The "Known behaviours & lessons" section is where incident knowledge that
would otherwise live only in a chat transcript gets written down permanently
— every entry names a symptom and either the fix or the accepted behaviour.
This is the same instinct as `forms-restyler-failure-archaeology`'s incident log, but scoped to what
someone operating the tool needs to know, and it ships in the repo instead of
staying in a session artifact.

## 3. Status-table discipline (DR-10)

Every completed milestone updates the relevant status table **and its date**
before moving on to the next thing. Concretely:

- `requirements/quality_improvements.md`'s "Implementation status (YYYY-MM-DD)"
  heading gets a new date whenever the table's content changes — don't leave a
  stale date next to fresh rows.
- **Distinguish "implemented" from "validated."** A row can be ✅ Implemented
  while still functionally unproven — say so in the Notes column instead of
  letting ✅ imply more than it does. The live example: as of 2026-07-18,
  `quality_improvements.md` marks QI-1/2/3/5/7/8/9/10/11 ✅ Implemented but the
  same document's closing note says "Full eval-set run against the rubric
  still pending" — implemented-but-unrated stays flagged in prose even though
  the table cell is ✅. Do not silently upgrade a status cell to imply
  validation that hasn't happened.
- Task files carry their own `## Status` field (`Not started` / `In progress`
  / `Done`) — update it as part of the same commit that changes the task's
  code, not as an afterthought.
- If a requirements doc has no status table yet (the FR-n pattern, §2a) and
  implementation starts, either add one or make sure `tasks/<feature>_tasks/`
  status fields are the tracked source of truth — pick one, don't let both
  drift independently.

## 4. Commit message style (verified against `git log`)

Pattern observed consistently across this repo's history:

- **Imperative subject line**, behavioural, under ~70 chars where possible:
  `"Bump default form TTL from 7 days to 30 days"`, `"Fix Gemini model ID to
  gemini-3-flash-preview"`, `"Batched SI revision: Google Forms footer, layout
  guidance, mobile & legibility rules"`.
- **Task-tag prefix** (`TASK-N: `) when the commit implements a specific task
  from a `tasks/<feature>_tasks/` breakdown — e.g. `TASK-1: Bump default form
  TTL from 7 days to 30 days`, `TASK-9: Document persisted forms + sweeper`.
  Commits outside a tracked task breakdown (SI edits, eval runs, ad-hoc fixes)
  don't use a prefix — subject line alone carries the meaning.
  Do not invent a new prefix convention; `TASK-N:` is the only one in use.
- **Body explains what behavioural rule changed**, not just what files
  changed — prompt text is code here (DR-4), so an SI-touching commit body
  should name the rule added/amended, e.g. commit `670a1d0`'s body lists each
  doc changed and why ("SI batch done; QI-4/6 validator next").
- **Docs are committed with the change they describe**, often as a dedicated
  commit within the same wave rather than folded into the code commit —
  e.g. `ed8e309 TASK-9: Document persisted forms + sweeper` is its own commit
  landing right after the code tasks (`c726d52`..`26619f1`) it documents, and
  `670a1d0 Document quality improvements: ...` follows directly after the SI
  commits (`d0b8c13`, `9a0726c`) it documents. Don't let documentation commits
  drift to "later, in a different session."
- `Co-Authored-By:` trailer is present on Claude-authored commits — keep it
  when the harness adds it; don't strip it.

## 5. The `em-review` skill — what it does, when to invoke it

`.claude/skills/em-review/SKILL.md` takes a requirements source (file path,
URL, inline text, or — if no argument — the current branch's diff/recent
commits) and runs:

1. **Phase 1 — Requirements Analysis**: reads the requirements and writes
   `tasks/REVIEW.md` covering summary, assumptions (safe/risky), open
   questions, risks (technical/product/operational/dependency), tradeoffs
   (options + recommendation), and out-of-scope-but-worth-noting items.
2. **Phase 2 — Task Breakdown**: splits the work into 1-3-day tasks ordered by
   dependency, each written as its own `tasks/TASK-{n}-{slug}.md` following
   the template in §2b.
3. **Phase 3 — Summary**: writes `tasks/PLAN.md` (overview, phases table,
   dependency graph, critical path, risk-mitigation mapping, task index).

**When to invoke it:** a new feature of nontrivial size — multiple files,
multiple sequenced pieces of work, or anything where skipping straight to
code risks missing an edge case a reviewer would catch (the persist-forms and
generation-progress-timeline features both went through it; a one-line SI
rule tweak or a single-file bug fix does not need it). Invoke it BEFORE
writing implementation code, not after.

**Placement note:** the skill as written outputs flat into `tasks/`. This
repo's convention (see `tasks/persist_generated_forms_tasks/`) is to move the
output into `tasks/<feature>_tasks/` afterward so multiple features' task
sets don't collide in one flat directory — do this unless the target
directory is feature-specific already (e.g. `app/tasks/` for something scoped
entirely inside `app/`).

## 6. House style

- **Plain declarative prose.** No marketing language, no hedging filler.
  State the fact, state the evidence, state the fix.
- **Tables for enumerable facts** — status, current-state-for-context,
  risk-mitigation mapping, dependency lists, decision logs. If you're writing
  "X is Y, and A is B, and C is D" as prose sentences, it's probably a table.
- **WHY sits next to WHAT.** Every requirement states the problem/evidence
  before the requirement text; every architecture note that documents a
  workaround states what it works around (e.g. architecture.md's
  `lib/image-gen.ts` section exists specifically because of the Vercel
  preview 401 self-fetch issue — say that, don't just describe the current
  shape).
- **Incident lessons get written where the next person will look**, not just
  narrated once. The "Known behaviours & lessons" section in
  `evals/tools/README.md` is the pattern: name the symptom, name the cause or
  accepted behaviour, say what to do. A lesson that only exists in a chat
  transcript or a session dossier is not yet durable — promote it into the
  README/architecture.md/skill it belongs to.
- **External artifacts that can't be edited in place get versioned**, not
  silently replaced. The Google Drive connector used for the eval-set doc can
  create a doc but not edit an existing one — so regenerating it produces a
  new file, and the convention is to suffix it v1, v2, v3 and say so in the
  requirements doc (`eval_set_creation.md`: "Google Doc v2 ... v1 doc retains
  the manually-fixed Paperform images"). Apply the same versioning discipline
  to any other externally-hosted, non-patchable artifact.
- **Date-stamp anything that will go stale.** "Status" headings, "as of"
  notes, and "Known behaviours" sections should carry a date or a month —
  readers need to know whether a fact is current-truth or historical.

## When NOT to use this skill

This skill governs *where documentation lives and what shape it takes* — not
the technical content itself. For the content, go to the sibling that owns it:

- Editing the system prompt or reasoning about SI rule tradeoffs →
  `forms-restyler-si-engineering`.
- Making/reviewing/merging any actual code or prompt change, or anything that
  touches Redis/Blob/Drive, branches, commits, PRs, or deploys →
  `forms-restyler-change-control` (load it before you act, not just before you
  write about it).
- Something in the app or eval pipeline is broken and you need to triage it →
  `forms-restyler-debugging-playbook`.
- You need the current, authoritative shape of the system (components, data
  flow, env vars) rather than instructions on how to write it down → read
  `documentation/architecture.md` directly, or use
  `forms-restyler-architecture-contract` if you need it distilled as a
  contract.
- Running or reasoning about the eval pipeline's mechanics (not just
  documenting them) → `forms-restyler-eval-pipeline`.
- Deciding what to validate a change against, or how →
  `forms-restyler-validation-and-qa`.

## Provenance and maintenance

Written 2026-07-19. Every convention above was verified by reading the actual
files, not inferred:

- Documentation map: `ls documentation/ requirements/ tasks/ app/tasks/
  evals/tools/`, and reading `documentation/architecture.md`,
  `documentation/persisted-forms.md`, `documentation/screenshot-production.md`
  headings.
- Requirement doc templates: full read of `requirements/quality_improvements.md`
  (QI-n pattern + status table), `requirements/future_improvements.md` (FI-n
  headings), `requirements/persist-generated-forms.md` (FR-n pattern),
  `requirements/eval_set_creation.md` (status-line variant).
- Task breakdown template: full read of
  `tasks/persist_generated_forms_tasks/PLAN.md` and `TASK-1-...md`; `ls` on
  `tasks/MVP_tasks/`, `tasks/V2_tasks/`, `app/tasks/` to confirm the
  placement inconsistency.
- Ops README template: full read of `evals/tools/README.md`.
- em-review behaviour: full read of `.claude/skills/em-review/SKILL.md`.
- Commit style and docs-with-code timing: `git log --oneline -40` plus
  `git show 670a1d0 --stat` and `git show ed8e309 --stat` on this repo, branch
  `si-improvements`.
- Status-table implemented-vs-validated distinction: the "Full eval-set run
  against the rubric still pending" line in
  `requirements/quality_improvements.md` (read 2026-07-19), cross-checked
  against DR-10 (docs-at-milestones) in `forms-restyler-change-control`.

Re-verify before reusing:
```
git log --oneline -20
sed -n '1,45p' requirements/quality_improvements.md
cat tasks/persist_generated_forms_tasks/PLAN.md
cat evals/tools/README.md
ls tasks/ app/tasks/
```
