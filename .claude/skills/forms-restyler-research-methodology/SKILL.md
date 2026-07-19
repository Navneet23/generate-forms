---
name: forms-restyler-research-methodology
description: Load when forming a hypothesis about generation quality in the Forms AI Restyler repo, designing an experiment or eval run, deciding whether evidence is sufficient to act, distinguishing a real root cause from the first plausible one, or turning a hunch into an adopted (or retired) change. Triggers — "why does this fail", "is this the root cause", "what would prove/disprove this", "design an experiment", "is one repro enough", "should we adopt this fix", "before/after eval", "drift keeps happening", "did the prompt fix actually work", "how do we know this is done", "write up the finding".
---

# Research methodology: from hunch to adopted change

This repo has produced real multi-cause bugs (INC-7: four independent causes behind
one symptom) and real false-starts that looked done but weren't (INC-9: a prompt fix
that reduced but did not eliminate drift). This skill is the discipline that catches
both failure modes: stopping at the first plausible cause, and declaring victory
without a way to be proven wrong. It is process guidance, not a place to look up repo
facts — for those, see the "When NOT to use this" section.

## 1. The evidence bar: one mechanism must explain ALL observations

A root-cause hypothesis is not adopted because it explains *a* symptom. It is adopted
only when it explains **every** observation on the table, including the negative ones —
the things that *didn't* happen, the attempts that *didn't* fix it, the cases the first
theory conveniently ignores. If you have to say "and separately, X" to cover a second
observation, you don't have one mechanism, you have two (or more), and both need
independent evidence.

**Worked example — the bar catching an incomplete theory (INC-7, mobile footer hunt).**
Symptom: on narrow screens the footer text rendered huge and the form card had excess
white space. The first plausible cause — the footer wordmark used `em` sizing and
inherited the form's display-font scale — explained the huge text. It did **not**
explain the excess white space in the card body; that's a different observation the
theory was silent on. Refusing to stop there surfaced three more independent causes:
SI rule 6's "≥16px on mobile" minimum was being misapplied to secondary/footer text,
desktop padding/margins were fixed instead of compressing, and step containers used
`min-height`/`space-between` so they stretched. All four were fixed together in
`app/lib/gemini.ts` (canonical footer now uses fixed inline px sizes and is exempt from
rule 6; rule 6 gained a secondary-text exemption, mobile padding bounds, and
content-sized containers). Lesson recorded at the time: "looks wrong on mobile" is
usually *several* causes — enumerate them before patching one, don't stop at the first
fix that makes the screenshot look better.

**Worked example — the bar working as a filter (INC-1, OAuth 403 that no consent-screen
change fixed).** Symptom: `Error 403: access_denied` from Google OAuth for the eval
Forms API. The obvious hypothesis class — something wrong with the OAuth consent
screen — was tried twice: adding test users, then publishing the consent screen to
production. Neither explained the one fact that mattered: the error **persisted
identically after both fixes**. A hypothesis that predicts "this should be fixed now"
and is wrong doesn't get a third variant tried; it gets discarded, because it cannot
explain the persistence. The hypothesis that survived — the downloaded
`client_secret.json` belonged to a *different* GCP project (client id prefix
`790977785064`) than the `forms-eval` project whose consent screen was actually being
edited (prefix `277948348438`) — explained the persistence directly (you can publish
a consent screen forever; it does nothing for a client id from an unrelated project).
It was confirmed by directly diffing the client id in the Cloud Console credentials
page against the client id in the JSON on disk, not by trying another fix and hoping.

| | Explains the primary symptom | Explains the negative (what *didn't* work) |
|---|---|---|
| INC-7 footer-font theory alone | yes (text size) | no (white space unexplained) — **rejected as sole cause** |
| INC-7 all four causes together | yes | yes | 
| INC-1 consent-screen theory | plausible | no (error persisted through two fixes) — **rejected** |
| INC-1 project-mismatch theory | yes | yes (explains why nothing consent-side could have worked) |

**Rule of thumb:** before you act on a mechanism, list every observation you have —
including failed fixes and things that stayed the same — and check the mechanism
against each one individually. If you find yourself writing "unrelated" or "separate
issue" next to an observation to make the theory fit, that is the theory failing the
bar, not a footnote.

## 2. A hypothesis predicts numbers before you run anything

Before running an experiment, write down what you expect to observe, precisely enough
that a different outcome would prove you wrong. "If X is the cause, rerunning under
condition Y should show Z" — not "let's try Y and see." If you cannot state the number
or observation that would falsify your idea, you do not have a hypothesis, you have a
guess dressed up as one.

### Applying it to the open problem: question-text drift (INC-9)

As of 2026-07-19 this is the one open, unresolved incident in the repo. Gemini
occasionally paraphrases question text or option labels despite the system
instruction's verbatim-text rules (example on record: "Rate your current
baking/decorating experience." rendered as "Rate your current experience"). It is
non-deterministic and infrequent; a retry usually produces correct output. Commit
`f5599da` ("Fix form content rewriting: strengthen prompt to preserve question text
verbatim") already strengthened the prompt once and drift persisted — so
"strengthen the prompt more" is a hypothesis that has already been tested and only
partially confirmed (see §3 for why that matters). `documentation/architecture.md`
records it as a known limitation with the structural fix (a post-generation
validator) marked out of scope for now; `requirements/quality_improvements.md`
QI-4/QI-6 is the pre-registered design for that structural fix, listed as "Not
started" as of 2026-07-18.

Three pre-registered hypotheses for *why* drift happens, each with a predicted
signature and the measurement that distinguishes it:

| Hypothesis | Predicted signature | Falsified if |
|---|---|---|
| **H1 — sampling noise.** Drift is ordinary LLM sampling variance, no structural trigger. | Rerunning the *identical* generation (same structure, prompt, style guide, single-turn) N times produces drift on a **different** question each time, roughly uniformly across question position/length. Drift rate is flat regardless of question complexity. | Drift repeatedly lands on the *same* question across reruns, or correlates with a question property. |
| **H2 — systematic trigger (e.g. long/compound question text).** Certain question shapes (compound phrasing with "/" or "and", long option lists, unusually long text) are disproportionately likely to drift. | Rerunning the same item N times shows drift clustering on the *same* question(s) at an above-baseline rate; drift rate correlates with question text length or compound-phrase markers across the corpus, not just within one item. | Drift position is uniformly distributed across reruns of the same item, uncorrelated with any question-text property. |
| **H3 — chat-history contamination.** An earlier turn (e.g. the `announce_plan` function-calling step, or a prior edit turn in an iterative session) states a paraphrase, and the paraphrase leaks into the final HTML because it's now in context. | Drift rate is markedly higher on multi-turn/iterative generations than first-turn generations; the drifted text matches wording that appears verbatim in an earlier assistant message (e.g. the plan announcement) rather than being a fresh invention. | Drift occurs at comparable rates on single-turn, no-history generations, or the drifted text doesn't match anything in prior turns. |

**Distinguishing measurement:** rerun the same eval item (same structure, prompt,
style guide) N times (N≥10 recommended — INC-17 already shows Gemini calls fail and
succeed intermittently, so a few reruns aren't enough to separate signal from noise),
holding everything else constant, and log per-question drift position for each run.
Compare against corpus-wide question properties (length, compound-phrase markers) and
against turn count / prior-message content. H1 predicts scatter; H2 predicts
clustering correlated with text shape; H3 predicts clustering correlated with turn
count and prior-turn wording. These are not mutually exclusive — more than one could
be partly true, in which case the evidence bar in §1 applies: whatever mechanism you
adopt must explain the *rate* and *distribution* you actually measured, not just the
existence of drift. See `forms-restyler-analysis-toolkit` for the concrete
drift-diffing mechanics (diffing generated HTML against `structure.questions[]`) this
measurement would reuse — the same diff QI-4's validator needs anyway.

## 3. Adversarial refutation: assign someone the job of breaking your conclusion

Before adopting a conclusion, explicitly assign the job of trying to break it — to
yourself in a separate pass, or to a subagent that doesn't share your priors. The job
is not "double-check my work," it's "find the observation this mechanism does not
explain." This is cheap to do in this repo three ways:

1. **Rerun the generation (non-determinism check).** If a "fix" appears to work once,
   that is not evidence — Gemini's outputs are non-deterministic and a single good run
   is exactly what you'd expect from a partial fix too. This is precisely why the
   `f5599da` prompt strengthening was believed to help and only later, over more runs,
   was recognized as incomplete (`documentation/architecture.md` calls it a "known
   limitation" that persists despite the strengthened prompt). One clean generation
   proves nothing; several does.
2. **Test the opposite / a different configuration.** The eval methodology already
   institutionalizes this: every eval item is generated under **both** Config A
   (`gemini-2.5-flash-image`) and Config B (`gemini-3.1-flash-image-preview`)
   specifically so a result that only holds for one config isn't mistaken for a
   general one. Apply the same instinct to any hypothesis about SI wording, image
   presence, or layout — check it against the config/condition where you'd expect it
   to look different, not just the one where you first saw it.
3. **Plant a known fault and confirm the instrument catches it.** Before trusting a
   detector, feed it a case where you already know the right answer. This is exactly
   what `requirements/quality_improvements.md` prescribes for the QI-4 validator:
   "feed known-bad HTML fixtures (drifted question text, missing entry ID, swapped
   type, missing notices) and assert each violation is caught; feed a known-good
   fixture and assert zero violations." An instrument that hasn't been shown to catch
   a fault you deliberately planted has not earned the right to tell you a fault is
   absent. `forms-restyler-analysis-toolkit`'s `--self-test` mode is this same
   discipline applied to that toolkit specifically.

If the adversarial pass can't find a hole, that's the point at which the conclusion is
strong enough to write into a status table (§4) — not before.

## 4. The idea lifecycle in this repo

This is the path a hunch actually travels here, reconstructed from git history and the
docs it left behind:

```
hunch
  -> requirement doc entry (QI-n / FI-n, with an explicit "how to address")
  -> [larger work only] em-review task breakdown into TASK-*.md files, phased
  -> feature branch
  -> implementation, iterated live against the dev server
  -> eval A/B against the 37-item set (or a targeted smoke test for small changes)
  -> dated status-table update + docs
  -> PR / merge to main  (== deploy, main is prod — see forms-restyler-change-control)
  -> or: documented retirement (written into "out of scope" / limitation prose,
     not silently dropped)
```

**Real instance — quality improvements, currently in flight on `si-improvements`
(not yet merged as of 2026-07-19).** The QI list itself was not invented top-down;
`requirements/quality_improvements.md` states its own origin: it "captures quality
improvements identified by analysing the evaluation rubric (`rater_instructions.md`)
against the current feature and system instructions ... in `app/lib/gemini.ts`" —
i.e. the hunches came from a rubric diff (see §5). That commit (`670a1d0`, "Document
quality improvements: requirements, statuses, rubric, architecture update") is the
requirement-doc-entry step. Implementation followed as two SI commits (`d0b8c13`
"Strengthen SI: visual distinction for radio vs checkbox..."; `9a0726c` "Batched SI
revision: Google Forms footer, layout guidance, mobile & legibility rules" — note the
doc's own caution against dribbling SI changes one rule at a time, honored by
batching). The eval-A/B step is `b8fa8db` (build the 37-item eval set) and `3900135`
(68/68 restyled generations across both image configs). The status table inside
`quality_improvements.md` is dated ("Implementation status (2026-07-18)") and marks
each QI item Implemented/Not started per-row — the dated-status-table step. What's
left for this instance, as of this writing, is the human rating pass and the
PR/merge — the lifecycle is mid-flight, not finished, which is itself useful ground
truth: not every hunch reaches "merged" quickly, and the doc + branch is exactly how
an in-progress one stays legible to the next person.

**Real instance — a smaller feature, start to finish.** Commit `8b5bd60` ("Add
generation progress timeline requirements, task breakdown, and EM review skill")
lands the requirement doc *and* the em-review task breakdown (`app/tasks/PLAN.md`,
`REVIEW.md`, `TASK-1..11`) in one commit — the em-review skill itself was written
for this feature. Implementation followed in wave commits (`41b10fe` "Implement
Wave 1...", `2c751c3` "Implement Waves 2-5..."), then merged via PR #2/#3 (merge
commits `b347104`, `14760b9`) — PR merge is the deploy step, per the `main == prod`
rule.

**Retirement is a documented decision, not a silent drop — two real examples:**

- *Prompt-only drift fix, retired as insufficient after `f5599da`.* The commit
  strengthened the SI's verbatim-text language. It reduced drift but did not
  eliminate it. Rather than trying a fourth or fifth prompt variant indefinitely,
  the repo recorded the finding in prose — `documentation/architecture.md`: "Prompt
  language has plateaued (commit `f5599da` already strengthened it and drift
  persists)" — and redirected the campaign to a structural fix (QI-4/QI-6). This is
  retirement of an *approach*, not of the goal; treat further prompt-only attempts
  at eliminating drift as a known-weak path unless you have new evidence the
  plateau has moved.
- *Pre-feature blob cleanup, declined at design time.* `documentation/persisted-forms.md`
  explicitly lists what the orphan-blob sweeper does **not** clean up, including
  "Pre-feature blobs... These are out of scope. To clean them up retroactively
  would require either listing every blob (and accepting that the sweeper would
  delete everything not currently referenced...) or building a one-time migration
  tool. Neither was in scope." That's a retirement recorded in the doc of record at
  the time the feature was built, not an accidental gap discovered later.

The FI list (`requirements/future_improvements.md`) and the "out of scope" prose
scattered through the other requirement docs are, collectively, the retirement
record for this repo — check there before assuming an idea was never considered.

## 5. Where good ideas came from here (so you know where to look)

Four sources have produced every substantiated hunch found in this repo's history —
look in these places before inventing a new one:

1. **Rubric analysis before any eval run.** The entire QI list in
   `requirements/quality_improvements.md` was derived by diffing
   `evals/rater_instructions.md` (the rating rubric, four stack-ranked dimensions:
   functionality, groundedness, completeness, aesthetics) against what the SI
   actually asks for. Anything the rubric checks that the SI is silent on is a
   guaranteed-failure candidate — QI-1 and QI-2 (footer notices, wordmark) were
   found exactly this way ("checks the current output can never pass — not risks,
   but certain rubric failures").
2. **User screenshots of real rendering failures.** INC-7 (mobile footer/white-space)
   and INC-8 (footer fidelity — a Google-Forms logo *glyph* appearing instead of the
   real grey-text wordmark, required links being dropped) were both root-caused
   against a live form / real screenshots, not against the SI's stated intent. QI-1's
   status note ("fixed 12px sizing after mobile feedback") and QI-11's ("amended...
   after live testing on narrow screens") record the same pattern: SI rules that look
   correct on paper get corrected against what actually renders.
3. **Incident postmortems turning into standing discipline rules.** INC-3 (an
   unknown CLI flag was silently ignored and the orchestrator ran the full batch,
   creating duplicate Google Forms in the user's Drive) produced a blanket rule —
   eval/ops CLI tools must abort on unknown arguments — that now applies to every
   tool in `evals/tools/`, not just the one that broke. A postmortem that stays
   scoped to "fix this one script" is doing half its job; the other half is asking
   "what class of tool should this rule apply to."
4. **Competitor-form study, which became the eval set itself.** `requirements/eval_set_creation.md`:
   the 37-item eval set's source material is "~39 high-quality competitor forms" (15
   real SMB forms plus 24 competitor templates from Typeform, Jotform, Paperform,
   Tally, Fillout). Studying what competitors' real forms look like — and, per
   INC-10, discovering that several of those competitor forms are one-question-at-a-
   time SPAs that only render their welcome screen to a headless scraper — is itself
   where a chunk of the eval pipeline's edge-case handling (thin extraction,
   type coercion for single-option questions, `&`-encoding in scraped text) came
   from. Reading competitor output critically is a source of hunches, not just a
   source of style guides.

## 6. Experiment record template

Use this shape for any nontrivial hypothesis-driven investigation in this repo.
Keep it short — a few sentences per field, not a report. For where this record
should physically live (which requirements doc, which incident log, whether it
needs its own file), see `forms-restyler-docs-and-writing`; the incident-log
convention it belongs alongside is the one this skill's INC-N examples are drawn
from.

```
## Experiment: <one-line name>
Date: YYYY-MM-DD

Hypothesis: <the mechanism, stated as a claim, not a question>

Predicted observation: <the specific number/pattern that would occur if the
  hypothesis is TRUE, precise enough to fail>
Falsifying observation: <what result would mean the hypothesis is WRONG>

Procedure: <what was run — item(s), config(s), N reruns, what was held constant>

Observed: <what actually happened, including any observation the hypothesis
  does NOT explain — do not omit inconvenient results>

Verdict: <adopted / rejected / partially confirmed (state exactly what part) —
  cite the adversarial-refutation attempt (§3) that was run against it>

Follow-up: <next experiment, or "closed — see <doc/commit>" if this reached the
  idea-lifecycle status-table step (§4)>
```

Applying it to INC-1 as a worked example of the template itself:

```
## Experiment: OAuth 403 root cause
Date: (reconstructed)

Hypothesis: The 403 is caused by a project-mismatch between client_secret.json
  and the forms-eval GCP project's consent screen.

Predicted observation: The client id in the downloaded JSON will NOT match any
  client id listed on the forms-eval project's credentials page.
Falsifying observation: The client ids match (would mean the mismatch theory is
  wrong and the 403 has some other cause).

Procedure: Open the Cloud Console credentials page for forms-eval; open
  client_secret.json; compare client id prefixes directly.

Observed: JSON client id prefix 790977785064; forms-eval project's clients all
  prefix 277948348438. Mismatch confirmed. This also explains why adding test
  users and publishing the consent screen (both tried first) did nothing — they
  operate on the forms-eval project, not the project the JSON belonged to.

Verdict: Adopted. Re-downloaded the client JSON from the correct project; re-ran
  `npm run auth`; error resolved.

Follow-up: closed — warning recorded in evals/tools/README.md so the next person
  checks client id match before touching the consent screen.
```

## When NOT to use this skill

- To look up whether a symptom or investigation has already happened — a settled
  battle, a dead end already tried — go straight to `forms-restyler-failure-archaeology`
  (the historical record of investigations/dead-ends/decisions) instead of re-deriving
  it. This skill tells you how to reason about a *new* claim; that skill tells you
  whether it's actually new.
- For live triage of something broken right now (symptom-to-fix table) —
  `forms-restyler-debugging-playbook`.
- To run the actual drift-diffing script, eval pipeline, or self-test tooling —
  `forms-restyler-analysis-toolkit` (mechanics) and `forms-restyler-eval-pipeline`
  (running `evals/tools/*.mjs`) own the how-to; this skill only tells you what
  question to ask before and after running them.
- To decide whether a change is already validated, design/interpret an A/B or rubric
  rating, or audit the eval-set inventory — `forms-restyler-validation-and-qa` owns
  "is this good enough to merge/claim"; this skill owns "is my hypothesis about why
  it's good/bad actually sound."
- To decide *where* a finding, decision, or status table should be written down, or
  how to phrase it — `forms-restyler-docs-and-writing`.
- To understand the current state of the drift-elimination campaign specifically
  (what's tried, what's next, whose turn it is) — `forms-restyler-drift-elimination-campaign`.
- To decide whether a change is safe to merge/deploy once you've already reached a
  verdict — `forms-restyler-change-control`.
- To read or modify the SI itself (`app/lib/gemini.ts`, the numbered rule list, the
  footer builder, why a given rule exists) — `forms-restyler-si-engineering`.
- To learn *why* the system is built the way it is (invariants, load-bearing
  behaviour) rather than how to investigate a new claim about it —
  `forms-restyler-architecture-contract`.

## Provenance and maintenance

Facts here are accurate as of 2026-07-19, cross-checked directly against the repo:
commit `f5599da` (`git show f5599da`), `documentation/architecture.md` (drift known
limitation, line ~229), `requirements/quality_improvements.md` (QI-4/QI-6 status,
verification section, rubric-diff origin statement), `documentation/persisted-forms.md`
(sweeper out-of-scope section), `requirements/eval_set_creation.md` (source material,
Config A/B, status), and `git log` (commits `670a1d0`, `d0b8c13`, `9a0726c`, `b8fa8db`,
`3900135`, `8b5bd60`, `41b10fe`, `2c751c3`, merge commits `b347104`/`14760b9`).
Incident narratives (INC-1, INC-7 causal chains, the OAuth client-id prefixes) are not
independently recoverable from the repo — they come from the retiring principal's
session records and are canonicalized in `forms-restyler-failure-archaeology`, which is
now the authoritative in-repo home for incident detail.

If a future prompt-strengthening attempt on drift (INC-9) actually eliminates it,
or the QI-4/QI-6 validator ships, update the drift example in §2 — it will no longer
be the open campaign target, and this skill's worked example should point at whatever
open question is live at that time instead. Re-verify the git commit list above if
`si-improvements` merges to main (commit hashes stay valid; the "not yet merged" /
"in flight" framing in §4 will become stale).
