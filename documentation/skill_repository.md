# Skill Repository — Forms AI Restyler

Last updated: 2026-07-19.

The project ships a skill library in `.claude/skills/` — distilled project knowledge
written so that a zero-context engineer or AI session can debug, extend, validate,
and advance this project without the original maintainer. Each skill is a
`SKILL.md` with frontmatter whose `description` states exactly when to load it;
`forms-restyler-analysis-toolkit` additionally ships runnable scripts under its
`scripts/` directory.

**How to use:** load the one skill that matches your task (each skill has a
"When NOT to use" section redirecting you if you picked wrong). Incident history
is numbered INC-* (canonical home: `forms-restyler-failure-archaeology`);
discipline rules are numbered DR-* (canonical home: `forms-restyler-change-control`).

## Skills by use case

### Getting set up and running

| Skill | One-line summary |
|---|---|
| `forms-restyler-build-and-env` | Recreate the dev environment from scratch: installs, `.env.local` via Vercel pull, verification gates (tsc/lint/build — there is no test suite or CI), dev-server traps. |
| `forms-restyler-run-and-operate` | Run the app end-to-end, deploy (main == prod), operate published forms and the blob sweeper, and know where every artifact lives. |
| `forms-restyler-config-and-flags` | Catalog of every configuration axis — env vars, model IDs, TTLs, CLI flags — with defaults, owners, guards, and re-verification commands. |

### Making changes safely

| Skill | One-line summary |
|---|---|
| `forms-restyler-change-control` | How changes are classified and gated here; the non-negotiable discipline rules (DR-1..DR-12) with the rationale and incident behind each. |
| `forms-restyler-architecture-contract` | The load-bearing invariants (verbatim text, entry.* names, self-contained HTML, submitUrl baking, shared Redis/Blob) — what must hold, why, and the known-weak points. |
| `forms-restyler-si-engineering` | The Gemini system instruction as production code: all numbered rules with their reasons, the canonical footer, function-calling flow, and how to change the SI without regressing a past incident. |
| `forms-restyler-docs-and-writing` | Where every kind of fact belongs (one home per fact), the house templates for requirements/tasks/READMEs, status-table discipline, commit style. |

### Fixing problems

| Skill | One-line summary |
|---|---|
| `forms-restyler-debugging-playbook` | Symptom → triage table for live failures across scraping, generation/SSE, images, submit, persistence, dev environment, eval pipeline, and mobile rendering. |
| `forms-restyler-failure-archaeology` | The historical record — every investigation, dead end, rejected fix, and settled decision (PRE-*, INC-1..20, DEC-*, open/accepted registry) so no settled battle is re-fought. |

### Domain knowledge

| Skill | One-line summary |
|---|---|
| `google-forms-internals-reference` | Google Forms internals as used here: the `FB_PUBLIC_LOAD_DATA_` index map, type codes, entry-ID submission protocol, responder footer contract, and Forms API v1 usage. |

### Measuring and validating quality

| Skill | One-line summary |
|---|---|
| `forms-restyler-validation-and-qa` | What counts as evidence here: the stack-ranked rubric digested, the golden eval inventory with caveats, and the acceptance discipline for claiming a change is validated. |
| `forms-restyler-eval-pipeline` | Operating the eval machinery in `evals/tools/`: pipeline stages, manifest state model, restyled-form generation (local-SI rule), and how to add eval items. |
| `forms-restyler-analysis-toolkit` | "Measure, don't eyeball" — tested scripts (`check-drift.mjs`, `check-submit-wiring.mjs`, `contrast-check.mjs`) plus manual measurement recipes, each with an interpretation guide. |

### Advancing the project

| Skill | One-line summary |
|---|---|
| `forms-restyler-drift-elimination-campaign` | The executable, decision-gated campaign for the hardest live problem: eliminating question-text drift and making quality automatically measurable (QI-4/QI-6 validator path). |
| `forms-restyler-research-methodology` | The discipline that turns a hunch into an accepted result: evidence bar, hypotheses that predict numbers, adversarial refutation, and the idea lifecycle as practiced here. |
| `forms-restyler-research-frontier` | The map of open problems (LLM-judge evals, deterministic skeleton, vision self-review, runtime smoke tests, …) with first steps in this repo and falsifiable result milestones. |

### Workflow helpers

| Skill | One-line summary |
|---|---|
| `em-review` | Pre-existing workflow skill: Engineering-Manager-style requirements review and task breakdown for a new feature (produces `tasks/REVIEW.md` + TASK files). |

## Common entry points

- "Something is broken" → `forms-restyler-debugging-playbook` (then `forms-restyler-failure-archaeology` if the symptom feels familiar).
- "I want to change the prompt/SI" → `forms-restyler-si-engineering` + `forms-restyler-change-control`.
- "Is this change good enough to merge?" → `forms-restyler-validation-and-qa`.
- "Run or extend the evals" → `forms-restyler-eval-pipeline`.
- "Work on drift / the validator" → `forms-restyler-drift-elimination-campaign` (uses `forms-restyler-analysis-toolkit`'s scripts).
- "What should we build next?" → `forms-restyler-research-frontier`.
- New machine / new engineer → `forms-restyler-build-and-env`, then `forms-restyler-architecture-contract`.

## Maintenance

- When adding a skill: give it a trigger-rich `description`, a "When NOT to use"
  section, and a dated "Provenance and maintenance" section; then add a row here.
- Volatile facts inside skills are date-stamped and carry one-line re-verification
  commands — re-run those before relying on counts, model IDs, or branch state.
- Verify this index matches reality with: `ls .claude/skills/`
