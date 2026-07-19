---
name: forms-restyler-build-and-env
description: Load when setting up the Forms AI Restyler project from scratch on a new machine, fixing a broken local environment, or when builds/type-checks/lint fail for environment reasons (missing deps, missing .env.local, wrong Node version, wedged dev server). Covers app + eval-tools install, Vercel env pull, verification gates (tsc/lint/build — there is no test suite or CI), the dev server and its known traps, and the repo layout/branch model. Not for day-to-day feature work or running the app (see forms-restyler-run-and-operate) and not for operating the eval pipeline itself (see forms-restyler-eval-pipeline).
---

# Forms AI Restyler — Build and Environment

Recreate a working local environment for this repo from nothing. Every claim
below was checked against the repo on 2026-07-19; re-verify anything you rely
on with the commands in "Provenance and maintenance" at the bottom if time has
passed.

## When NOT to use this skill

| You want to... | Use instead |
|---|---|
| Run the app day-to-day, know what the dev server does, operate features | `forms-restyler-run-and-operate` |
| Run/operate the eval pipeline (`evals/tools/`), OAuth flow in depth, manifest discipline | `forms-restyler-eval-pipeline` |
| Debug a broken feature (scraping, generation, submit, publish) | `forms-restyler-debugging-playbook` |
| Change the system instruction / gemini.ts prompt, or merge/deploy | `forms-restyler-change-control`, `forms-restyler-si-engineering` |

This skill is only about: getting the repo to install, build, type-check, and
lint; getting a dev server up; and knowing the environment-level traps that
have bitten people here before.

## 1. Prerequisites

| Requirement | Version in use here (2026-07-19) | Why |
|---|---|---|
| Node.js | `v25.6.0` (confirmed via `node --version` on the working machine) | App runs Next.js `16.1.6`, whose installed package declares `"engines": { "node": ">=20.9.0" }` (`app/node_modules/next/package.json`). Any Node ≥ 20.9 satisfies it; the machine used for this snapshot happens to run 25.6.0 — don't assume you need that exact version, just something current. |
| npm | `11.8.0` on the same machine | Ships with Node; no separate install step. |
| Vercel CLI | Not vendored in `package.json` — install globally (`npm i -g vercel`) if you need `vercel env pull` | Only needed to obtain `app/.env.local`; not needed to read code or run `tsc`/lint against an existing `.env.local`. |
| Google account | N/A | Only needed for the eval tooling (Google Forms API + OAuth). Not needed to build/run the app itself. |

There is no `engines` field in `app/package.json` or anywhere else in this
repo enforcing a Node version — the `>=20.9.0` constraint above comes from
Next.js's own installed `package.json`, not from this project's config.

## 2. App setup

```bash
cd app
npm install
```

`app/package.json` key facts (verified 2026-07-19):
- `next@16.1.6`, `react@19.2.3`, `react-dom@19.2.3`, `typescript@^5`
- scripts: `dev` → `next dev`, `build` → `next build`, `start` → `next start`, `lint` → `eslint`
- `puppeteer@^24.37.5` / `puppeteer-core@^24.37.5` are dependencies of the app itself (used by `app/lib/scraper.ts` for source-form extraction), not just the eval tools.

### Obtaining `app/.env.local`

This file is **not in git** (`app/.gitignore` has `.env*` and `.env*.local`)
and is pulled from the linked Vercel project:

```bash
cd app
npx vercel login          # if not already authenticated
npx vercel link           # if app/.vercel is missing; this repo already has
                           # app/.vercel/project.json linking to Vercel
                           # project "app" (projectId prj_tgOha8J7rLNuoY8Iy4bojlOmyWLf)
npx vercel env pull .env.local
```

`app/.vercel/` already exists in this checkout (it's gitignored, so it
travels with the machine, not the repo — a fresh clone will need `vercel
link`). The env file as of 2026-07-19 defines these variable names (values
withheld deliberately — never paste secret values into a skill file):

```
BLOB_READ_WRITE_TOKEN
KV_REST_API_READ_ONLY_TOKEN
KV_REST_API_TOKEN
KV_REST_API_URL
KV_URL
REDIS_URL
VERCEL_OIDC_TOKEN
GEMINI_API_KEY
```

**WARNING (DR-2, the shared-state rule in `forms-restyler-change-control`):** these credentials point at
the **same Upstash Redis and Vercel Blob store that production uses.** There
is no separate staging store. Running the app locally with this
`.env.local` means every publish, extend, or blob upload you make from
`localhost` is a write to production data. Do not run destructive
experiments (bulk deletes, sweeper testing) against it casually, and never
hand-delete Redis keys. See `forms-restyler-run-and-operate` and
`forms-restyler-eval-pipeline` for what routinely writes here.

`evals/tools/` reads `GEMINI_API_KEY` and `BLOB_READ_WRITE_TOKEN` from this
same `app/.env.local` (relative path `../../app/.env.local` — see
`evals/tools/README.md`), so pulling it once in `app/` covers both.

## 3. Verification gates

**There is no automated test suite and no CI in this repo.** The only
verification gates that exist are the ones below, run manually. Treat that
as a real gap, not an oversight to route around — see
`forms-restyler-debugging-playbook` for how issues actually get caught here
in practice (live generation + the eval set + human rubric).

| Gate | Command (from `app/`) | What it actually checks |
|---|---|---|
| Type-check | `npx tsc --noEmit` | Compiles against `app/tsconfig.json` (`strict: true`, target ES2017, includes `**/*.ts`, `**/*.tsx`, `**/*.mts`). Catches type errors only — no runtime behavior. |
| Lint | `npm run lint` (→ `eslint`) | Runs `eslint.config.mjs`: `eslint-config-next` core-web-vitals + typescript rule sets, with `.next/**`, `out/**`, `build/**`, `next-env.d.ts` ignored. |
| Build | `npm run build` (→ `next build`) | Full production build — will surface issues `tsc`/lint miss (e.g. server/client boundary violations, route errors). This is the closest thing to an integration check that doesn't require the network/Redis. |
| Live dev-server check | `npm run dev`, then exercise the app manually | The actual verification method used in this project for behavioral correctness — no substitute exists. See `forms-restyler-run-and-operate`. |

Run them in that order — cheapest/fastest first. None of the first three
touch Redis/Blob/Gemini; they're safe to run repeatedly without DR-2
concerns. `npm run build` does not itself call any external API either (it's
a static/production build step, not a request to `/api/generate`).

### Ad-hoc scripts (not a test suite — read before trusting)

`app/test_redis.mjs` (untracked as of 2026-07-19 — appears in `git status`
as `??`, is not in any `.gitignore`, and is not committed; don't assume it
exists on a fresh clone or that it will survive a `git clean`):
- Manually parses `.env.local` in `app/` (its own tiny parser, not
  `dotenv`), builds an `@upstash/redis` client from `KV_REST_API_URL` /
  `KV_REST_API_TOKEN`, and does a `SET` with a 10s TTL followed by a `GET`
  on a throwaway key (`test_<timestamp>`).
- Run with: `cd app && node test_redis.mjs` (must be run from `app/` — it
  reads the literal relative path `.env.local`).
- What it proves: the Redis credentials in `.env.local` are valid and
  reachable. It writes one small, self-expiring key to the **production**
  Redis store (DR-2) — low-risk (10s TTL) but still a real write.

`app/test_persistence.mjs` (tracked, dated 10 May):
- End-to-end check of the publish/extend flow against a **running dev
  server**: POSTs `/api/publish` with a trivial HTML body, asserts a 10-char
  id and an `expiresAt` ~30 days out; calls `/api/forms/<id>/extend`,
  asserts `expiresAt` becomes ~365 days out; calls extend again and asserts
  idempotency (same `expiresAt`); calls extend on a bogus id and asserts a
  404.
- Run with: `npm run dev` in one terminal, then `node test_persistence.mjs`
  in another (from `app/`). Optional override: `TEST_BASE_URL=https://...
  node test_persistence.mjs` to point it at a deployed instance instead of
  localhost.
- It also documents (as comments, not executable code) a manual "sweeper
  runbook" for `/api/cron/sweep-blobs` — force-expiring a Redis record and
  confirming the cron sweeper deletes only orphaned blobs. That part
  requires `CRON_SECRET` and is not scripted; follow the comments in the
  file if you need to exercise it.
- Same DR-2 caveat: this writes real records (a `test-form` publish + two
  extends) to the shared Redis/Blob store every time you run it.

## 4. Dev server

```bash
cd app
npm run dev     # next dev, binds :3000
```

Open `http://localhost:3000`.

### Known traps

**Wedged port / stale lock (INC-15).** A previous `next dev` process can
hold port 3000 and the `.next/dev` lock, so a new `npm run dev` fails with a
confusing error (not a clear "port in use" message). Fix:

```bash
lsof -ti :3000 | xargs kill
```

Then restart `npm run dev`.

**Background-shell cwd reset (INC-20).** If you start `npm run dev` (or any
long-running command) as a background shell/subagent task, do not assume it
starts in the repo root or even in `app/` — background shells here have been
observed starting in the wrong directory. Always `cd` explicitly or use
absolute paths in background commands, e.g.:

```bash
cd /path/to/noCodeTools/app && npm run dev
```

(never rely on an inherited cwd from a prior foreground command).

## 5. Eval-tools setup

```bash
cd evals/tools
npm install
```

`evals/tools/package.json` key facts (verified 2026-07-19): `type: module`,
scripts `auth` → `node auth.mjs`, `run` → `node run.mjs`. Dependencies:
`@google/generative-ai@^0.24.1`, `@vercel/blob@^2.6.1`,
`googleapis@^173.0.0`, `puppeteer@^24.37.5`.

### Puppeteer version must match the app's

| Package | Puppeteer version pinned (2026-07-19) |
|---|---|
| `app/package.json` | `^24.37.5` |
| `evals/tools/package.json` | `^24.37.5` |

These currently match. Puppeteer downloads its own pinned Chrome/Chromium
build into a shared local cache keyed by Puppeteer's version — as long as
both `package.json`s resolve to the same Puppeteer version, `npm install` in
`app/` and in `evals/tools/` share one Chrome binary download. **If they
diverge** (e.g. someone bumps one but not the other), `npm install` in
whichever directory has the newer pin will trigger a **second, separate
Chrome download** (extra disk + install time, and two binaries to keep in
sync mentally). If you bump Puppeteer in one `package.json`, bump it
identically in the other in the same change.

### Google OAuth (one-time) — summary only

Full flow, troubleshooting, and manifest discipline live in
`forms-restyler-eval-pipeline` — don't duplicate that here. Summary of the
one-time setup from `evals/tools/README.md`:

1. `npm install` in `evals/tools/` (above).
2. In Google Cloud Console: create/select a project → enable the **Google
   Forms API** → configure the OAuth consent screen (External) → create a
   **Desktop app** OAuth client → download its JSON to
   `evals/tools/credentials/client_secret.json`.
   - Known trap (INC-1): the downloaded client JSON must belong to the
     **same** GCP project as the consent screen you configured, or you get a
     `403: access_denied` that no consent-screen change will fix. If you hit
     that error, diff the client id in the JSON against the project's
     credentials page before touching the consent screen again.
3. `npm run auth` (from `evals/tools/`) — opens a browser loopback OAuth
   flow; caches a token to `evals/tools/credentials/token.json`. Testing-mode
   consent screens issue tokens that expire in ~7 days; production-mode
   tokens don't expire the same way.
4. `GEMINI_API_KEY` and `BLOB_READ_WRITE_TOKEN` are read from
   `../../app/.env.local` — no separate secrets file for the eval tools.

**`evals/tools/credentials/` is gitignored** (confirmed in
`evals/tools/.gitignore`: `node_modules/` and `credentials/`) and must stay
that way — it holds `client_secret.json` and `token.json` (DR-11). Never
remove that line or force-add files under it.

## 6. Repo layout

Top level (verified 2026-07-19):

| Directory | Contents |
|---|---|
| `app/` | The Next.js 16 application — routes (`app/app/api`, `app/app/f`), UI components (`app/components/`), core logic (`app/lib/gemini.ts`, `image-gen.ts`, `scraper.ts`, `store.ts`), and this directory's own `tasks/` subfolder. |
| `evals/` | Eval set data and tooling: `evals/tools/` (pipeline scripts, see §5), `evals/manifest.json` (generated — never hand-edit) + `evals/manifest-items/` (per-item shards, source of truth), `evals/sources.json`, `evals/style-guides/`, `evals/rater_instructions.md`, `evals/eval-set-doc.html`. |
| `documentation/` | Docs of record: `architecture.md`, `persisted-forms.md`, `screenshot-production.md`. |
| `requirements/` | Requirements/status docs: `MVP_REQUIREMENTS.md`, `V2_REQUIREMENTS.md` through `V4_REQUIREMENTS.md`, `quality_improvements.md`, `eval_set_creation.md`, `image_support.md`, `persist-generated-forms.md`, `future_improvements.md`. |
| `tasks/` | Top-level per-feature task breakdowns (e.g. `MVP_tasks`, `persist_generated_forms_tasks`, `V2_tasks`). |
| `.claude/skills/` | This skill library. |

There is no root-level `package.json` — `app/` and `evals/tools/` are two
independent npm projects; there's no workspace/monorepo tooling tying them
together. Install and run commands must be issued from inside whichever
directory you're working in.

### Branch model

- `main` == production. The Vercel deployment
  (`https://app-red-phi-88.vercel.app`) builds from `main`; merging to
  `main` is deploying. See `forms-restyler-change-control` before merging
  anything.
- Feature branches carry work until validated. As of 2026-07-19, the active
  branch is `si-improvements`, 6 commits ahead of `main` and not yet merged:
  `d0b8c13`, `9a0726c`, `670a1d0`, `b8fa8db`, `4ca33a4`, `3900135` (oldest
  first, per `git log`). Production is currently running the **older**
  system instruction that predates this branch.

## 7. Known environment traps

| Trap | Symptom | Fix |
|---|---|---|
| Wedged dev server (INC-15) | New `npm run dev` fails confusingly; port 3000 already bound | `lsof -ti :3000 \| xargs kill`, then restart. |
| Background-shell cwd reset (INC-20) | A background command runs in the wrong directory (e.g. repo root instead of `app/`, or vice versa) | Always `cd /absolute/path && <command>` explicitly in background commands; never rely on inherited cwd. |
| Heredoc commit messages break on quoting (INC-20) | `git commit -m "$(cat <<'EOF' ... EOF)"` mangles or fails in this environment | Write the commit message to a scratch file first, then `git commit -F <file>`. |
| `.DS_Store` / `app/debug.log` reappearing as untracked | `git status` shows them as `??` despite feeling like they should be ignored | They **are** covered by the root `.gitignore` (added in commit `4ca33a4`, "Ignore .DS_Store and debug.log" — contents: `.DS_Store` and `app/debug.log`). If you see them as untracked, you're likely on a commit before `4ca33a4`, or a *new* stray file exists at a different path than the two covered — check `cat .gitignore` before adding more entries. |
| Puppeteer version drift between `app/` and `evals/tools/` | A second Chrome binary gets downloaded on `npm install` | Keep both `package.json` Puppeteer pins identical (see §5). |
| Shared Redis/Blob with prod (DR-2) | Local writes (publish, extend, ad-hoc test scripts) show up in production data | No environment fix — this is by design. Be deliberate about what you publish/extend/delete locally; see `forms-restyler-run-and-operate` / `forms-restyler-eval-pipeline` for what routinely writes here. |

## Provenance and maintenance

Written 2026-07-19. Facts verified by directly reading, on that date:
`app/package.json`, `evals/tools/package.json`, `app/tsconfig.json`,
`app/eslint.config.mjs`, `.gitignore` (root, `app/`, `evals/tools/`),
`evals/tools/README.md`, `app/test_redis.mjs`, `app/test_persistence.mjs`,
`app/node_modules/next/package.json` (for the Node engines constraint),
`app/.vercel/project.json` and `app/.vercel/README.txt`, `app/vercel.json`,
`app/next.config.ts`; and by running `node --version`, `npm --version`,
`git status --short`, `git log --oneline main..si-improvements`, and
directory listings of the repo root, `app/`, `evals/`, `evals/tools/`, and
`.claude/skills/`. Env var *names* (not values) were confirmed against the
existing `app/.env.local` on the machine used for this session — no secret
values were read into this file.

Unverifiable / time-bound claims to re-check periodically: the exact Node
version "in use today" (machine-specific — re-run `node --version`); the
si-improvements commit list and its ahead-of-main count (branches move —
re-run `git log --oneline main..si-improvements`); whether
`app/test_redis.mjs` is still untracked (re-run `git status --short
app/test_redis.mjs`); whether the Puppeteer pins in `app/` and
`evals/tools/` still match (re-run `grep '"puppeteer"' app/package.json
evals/tools/package.json`).

Re-verification commands:
```bash
node --version && npm --version
git -C /path/to/noCodeTools log --oneline main..si-improvements
git -C /path/to/noCodeTools status --short
grep '"puppeteer"' app/package.json evals/tools/package.json
grep -n engines app/node_modules/next/package.json
```
