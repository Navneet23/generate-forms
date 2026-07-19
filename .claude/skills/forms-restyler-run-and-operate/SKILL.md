---
name: forms-restyler-run-and-operate
description: Load when running the Forms AI Restyler app end-to-end (local dev, the paste-URL-to-publish flow), deploying to Vercel, operating published forms (extend/expire), running or reasoning about the blob sweeper, investigating a live submit failure, or figuring out where an artifact (form HTML, image, eval record) actually lives. Triggers — "run the app", "npm run dev", "publish a form", "deploy", "merge to main", "extend a form", "run the sweeper", "curl the cron endpoint", "is this form still live", "why didn't my submission land", "screenshot route is broken", "where does this get stored".
---

# Forms AI Restyler — Run and Operate

Day-to-day operation of the product: running it locally, deploying it, and
operating what's already live. This skill assumes the app already builds —
for editing the SI/prompt or app code, and for merge gates, use the sibling
**forms-restyler-change-control** skill first; this one governs what happens
*after* code is correct.

**The one fact that overrides your instincts here:** local dev is not a
sandbox. Every `npm run dev` on this repo talks to the same production Redis
and Blob store as `https://app-red-phi-88.vercel.app`. Read §4 before running
anything that publishes, extends, or sweeps.

## 1. Local run

```bash
cd app
npm run dev        # next dev, http://localhost:3000
```

Prerequisites: `app/.env.local` must exist (pulled from the Vercel project —
see **forms-restyler-build-and-env** for how to get it; not covered here).
There is no separate seed/setup step and no local-only datastore — the app is
live against prod state the moment the server answers requests.

### End-to-end manual flow

| Step | UI action | What happens | What to expect |
|---|---|---|---|
| 1. Load | Paste a **public** Google Form URL into the top bar (`app/components/UrlBar.tsx`, placeholder "Paste a public Google Form URL...") and click "Load Form" / Enter | `POST /api/scrape` fetches and parses the form | The original form renders in the left preview pane; the chat panel unlocks. A private or malformed form URL returns an error string in red under the input, not a crash. |
| 2. Prompt | Type a styling instruction in the chat panel (`app/components/ChatPanel.tsx`) and Send | `POST /api/generate` is called with `{ structure, prompt }`; response streams as an SSE-style progress timeline | A timeline of generation steps appears (see `documentation/screenshot-production.md`'s sibling doc on the timeline feature, or **forms-restyler-debugging-playbook** if it stalls); the right/preview area fills with the restyled HTML when done. |
| 3. (Optional) Style guide / image | "Style Guide" button — upload an image or capture a website screenshot | Screenshot capture hits `POST /api/screenshot` (degraded on prod — see §7); upload hits `POST /api/upload` | On prod, "Use a website" may 501 — use image upload instead, which always works. |
| 4. Publish | "Publish" button in the bottom bar (disabled until `generatedHtml` exists) | `POST /api/publish` with `{ html, formId, imageKeys }` | A shareable `/f/{id}` URL appears with a Copy button, an "Open ↗" link, and an "Expires <date>" label (~30 days out). **This write lands in the shared prod store — see §4.** |
| 5. (Optional) Extend | "Keep it for 1 year" button, visible once published | `POST /api/forms/{id}/extend` | Button becomes "Kept for 1 year ✓" and is disabled; a second click is a no-op by design (idempotent, see §3). |

Source: `app/app/page.tsx` (`handlePublish`, `handleExtend`), `app/components/UrlBar.tsx`, `app/components/ChatPanel.tsx` (`send()`, `/api/generate` call ~line 272, `/api/upload` ~line 224).

## 2. Deployment

| Fact | Value | Source |
|---|---|---|
| Vercel prod domain | `https://app-red-phi-88.vercel.app` | verified live: `curl -o /dev/null -w '%{http_code}' https://app-red-phi-88.vercel.app/` → `200` (2026-07-19) |
| Builds from | `main` | **DR-5** in forms-restyler-change-control; no separate release step |
| Deploy trigger | Merging a PR to `main` **is** deploying | same |
| Project root directory | `app/` | commit `a972970` "Trigger rebuild with correct root directory" — the Vercel project's Root Directory setting was fixed to `app/` after an earlier misconfigured build; `app/vercel.json` (not a repo-root `vercel.json` — there isn't one) is what Vercel reads |
| Cron config | `app/vercel.json` → `crons: [{ path: "/api/cron/sweep-blobs", schedule: "0 3 * * *" }]` | read directly, 2026-07-19 |

There is no staging environment and no CI (**forms-restyler-change-control**
§0 key facts). "Deploying" has exactly one gate: whatever validation the
change-control skill's class-appropriate checklist requires, then `gh pr
merge` (or the user does it). Do not merge to main casually — treat it as
equivalent to running the change on the public URL, because it is.

## 3. Data/artifact conventions — what lands where

| Artifact | Storage | Key | Served at | Lifetime | Notes |
|---|---|---|---|---|---|
| Published form HTML | Upstash Redis | `nanoid(10)` generated in `app/app/api/publish/route.ts` | `GET /f/{id}` (`app/app/f/[id]/route.ts`, returns the raw HTML with `Content-Type: text/html`, or a 404 HTML stub) | 30 days default (`TTL_SECONDS` in `app/lib/store.ts`); one-time extend to 365 days | `record.extended` flag gates the extend; `redis.set(id, ..., { ex: TTL })` refreshes the TTL on write. Legacy pre-feature records (no `expiresAt` field) are treated as 7-day TTL for display purposes only (`LEGACY_TTL_SECONDS`) — no re-write happens. |
| Generated images | Vercel Blob | blob `pathname`, produced during generation (`app/lib/image-gen.ts`) | Permanent CDN URL returned by Blob at upload time; embedded directly in the form HTML | No native TTL on Blob itself — lifecycle is enforced indirectly by the sweeper (§5) | Keys used by a form are recorded on that form's Redis record as `imageKeys: string[]`, written at publish time (`POST /api/publish` body includes `imageKeys`, deduped via `Array.from(new Set(...))`). If a form's Redis record expires, its blobs become orphaned until the sweeper's next run. |
| Eval artifacts (generations, ratings, manifest) | Local filesystem under `evals/`, plus published `/f/{id}` URLs for generated eval forms | — | — | Eval-published forms use the same 30-day/1-year lifecycle as any other publish | Cross-ref **forms-restyler-eval-pipeline** for the full eval data model; not covered further here. |

Extend-authorization model, stated plainly: **anyone who knows the `/f/{id}`
id can extend that form to 1 year.** There is no token or ownership check
(`app/app/api/forms/[id]/extend/route.ts` takes only the id from the URL
path). This is an accepted weakness, not an oversight — documented in
`documentation/persisted-forms.md` under "Extension semantics". Do not
"fix" this without raising it as a scoped change (auth is out of scope for
the current feature).

## 4. CRITICAL: local dev mutates production (DR-2)

`app/lib/store.ts` builds its Redis client from
`publish_KV_REST_API_URL`/`KV_REST_API_URL` in `.env.local`. That file is
pulled from the same Vercel project prod runs on. **There is no local or
staging datastore.** Any of the following, run from `npm run dev` on your
machine, writes to the real production Redis/Blob:

| Action | Prod-mutating? | Why |
|---|---|---|
| Publish a form (`POST /api/publish`) | Yes | Writes a real Redis key with a real 30-day TTL; the returned `/f/{id}` URL is live on prod's domain-independent store the instant it's created (reachable from `localhost:3000/f/{id}` AND, once deployed, from the prod domain, because it's the same Redis) |
| Extend a form (`POST /api/forms/{id}/extend`) | Yes | Mutates the shared record, consumes the one-time extend |
| Generate with an image model enabled | Yes | Uploads to the shared Vercel Blob bucket |
| Running `app/test_persistence.mjs` against local dev | Yes | It calls the real `/api/publish` and `/api/forms/{id}/extend` endpoints — read its own header comment; it explicitly warns the sweeper checks are a manual runbook, not scripted, "since they require a real Vercel Blob bucket" |
| Running `app/test_redis.mjs` | Yes | Sets/gets a real key in the shared Redis (uses a short 10s TTL and a `test_` prefix, but it is still a live write) |
| Running the sweeper (§5) | Yes, destructively | Deletes real Blob objects |
| Loading a form (`/api/scrape`), generating without publishing, previewing | No | Read-only against the source Google Form; generation output stays in browser state until Publish is clicked |

Practical rule: treat every `npm run dev` session as "prod with a
localhost-shaped URL bar." Don't batch-test publish/extend flows beyond what
a normal manual verification needs (DR-7, pilot-first).

## 5. The sweeper

`app/app/api/cron/sweep-blobs/route.ts` — deletes Vercel Blob objects that no
longer belong to any live (unexpired) form record, because Blob has no
native TTL of its own.

- **Schedule:** daily at 03:00 UTC, via `app/vercel.json` `crons[0]`.
- **Manual invocation:**
  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" \
       https://app-red-phi-88.vercel.app/api/cron/sweep-blobs
  ```
  Returns 401 without a matching bearer token (`process.env.CRON_SECRET`).
- **Algorithm:** `listAllImageKeys()` scans every live Redis form record and
  unions their `imageKeys`; pages through every Blob object
  (`list({ cursor, limit: 1000 })`); for each blob, skip if its `pathname` is
  in the in-use set, skip if uploaded within the last hour (`SAFETY_WINDOW_MS`
  — protects an in-flight publish whose Redis record hasn't been written
  yet), otherwise `del(blob.url)`.
- **Response fields:** `{ scanned, deleted, skippedInUse, skippedFresh,
  errors? }` (JSON; `errors` omitted when empty).
- **What it deliberately does NOT delete** (source of record:
  `documentation/persisted-forms.md` "What the sweeper deliberately does NOT
  clean up"):
  1. **Pre-feature blobs** — uploaded before this feature shipped, whose form
     records may have already expired without ever recording `imageKeys`.
     Out of scope; cleaning them retroactively would require either treating
     "everything unreferenced" as garbage (unsafe — would catch legacy live
     forms lacking `imageKeys`) or a one-time migration tool that wasn't built.
  2. **Blobs younger than 1 hour** — the safety window.
  3. **Blobs referenced by a live form**, even if no longer embedded in that
     form's current HTML (e.g. swapped during a refinement turn) — the
     `imageKeys` list is a conservative superset; cleanup waits for the whole
     form to expire.

**Caution:** never run the sweeper experimentally against the shared store
without first reasoning through what is currently unreferenced. It is a real
delete against the same Blob bucket prod serves images from (DR-2). There is
no dry-run flag. If you need to validate sweeper behavior, use the manual
runbook at the bottom of `app/test_persistence.mjs` (publish a form with
images, confirm blob keys, force-expire via `redis-cli DEL <id>`, run the
sweeper, confirm only that form's blobs were deleted) rather than invoking it
blind.

## 6. Submission path in production

Generated forms never submit directly to Google. Flow:

1. The SI bakes a `submitUrl` into the generated HTML at generation time —
   `app/app/api/generate/route.ts` (~line 61):
   `` `${req.nextUrl.origin}/api/submit/${structure.formId}` ``. **The origin
   is whatever server generated the form.** A form generated against
   localhost bakes a `localhost:3000` submit URL and will not work once
   published to prod — this is intentional, load-bearing behavior (INC-6 in
   `forms-restyler-failure-archaeology`), not a bug; it's why eval tooling
   rewrites the URL before publishing to prod (INC-5, `evals/tools/generate-restyled.mjs`).
2. The generated form's client JS `POST`s the answers to that submit URL.
3. `app/app/api/submit/[formId]/route.ts` proxies the POST as
   `application/x-www-form-urlencoded` to
   `https://docs.google.com/forms/d/e/{formId}/formResponse`, treating
   Google's 200, 302, or opaque-redirect 0 as success. It handles `OPTIONS`
   explicitly and sets `Access-Control-Allow-Origin: *` on every response —
   required because generated forms render inside `srcdoc` iframes, which
   have a null origin and trigger a CORS preflight even against localhost.

**To verify a submission truly landed:** the submit proxy returning
`{ status: "ok" }` only proves Google Forms accepted the POST — it does not
prove the answer is visible anywhere in this app (there is no submissions
view here). The only real confirmation is checking the **original form
owner's** Google Form responses tab or its linked Google Sheet for a new row
matching the submitted values. If you don't own the source form, you cannot
independently verify this step — say so rather than assuming success from a
200.

## 7. Screenshot route — production status

Doc of record: `documentation/screenshot-production.md` (verified current,
2026-07-19) — treat this section as a summary only.

| Environment | Status | Mechanism |
|---|---|---|
| Local dev | Working | `puppeteer` (bundled full Chromium) |
| Vercel prod (free tier) | Degraded / may fail | `@sparticuz/chromium` + `puppeteer-core`; can hit the 50MB compressed function size limit, the 10s free-tier timeout (page-load timeout is already set to 15s, i.e. already over budget), or the 1024MB memory limit |

Fallback: if Chromium fails to launch, `POST /api/screenshot` returns
`501` with `{ "error": "Website screenshot is not available in this
environment. Use image upload instead." }`. The manual image-upload path in
the Style Guide dialog is unaffected by any of this and always works. Do not
promise "use a website" screenshot capture will work in a prod demo without
testing it live first.

## 8. Ops checklists

### Before deploying (merging to main)

Full gate lives in **forms-restyler-change-control** §1–§3 (change taxonomy,
DR rules, pre-merge checklist) — this is a pointer, not a replacement:

- [ ] Change is classified (SI / app code / eval tooling / docs) and its gate is met
- [ ] `cd app && npx tsc --noEmit` and `npm run lint` clean
- [ ] Changed flow exercised live on `npm run dev` (§1 of this skill)
- [ ] If the change touches publish/extend/sweep/screenshot paths, re-read §4
      of this skill and confirm nothing was "tested" against prod state
      carelessly
- [ ] Owner sign-off obtained if the merge deploys or touches shared artifacts

### Investigating a live published form

1. `curl -s https://app-red-phi-88.vercel.app/f/{id}` — if it 404s
   (`<h1>Form not found</h1>`), the record has expired or never existed;
   nothing else to check.
2. Inspect the returned HTML for the baked submit URL: `grep -o
   "https\?://[^\"']*api/submit/[^\"']*"` against the response. If it points
   at `localhost:3000` instead of the prod origin, this form was generated
   locally and published without the submit-URL rewrite — it will 404/fail
   on every real submission from a visitor's browser. This is the exact
   failure mode INC-5/INC-6 exist to prevent: the submit URL is baked from
   whichever origin generated the form (`req.nextUrl.origin` in
   `/api/generate`), not from wherever it's later published, so any
   generate-on-localhost-then-publish-to-prod path needs an explicit rewrite
   step (see `evals/tools/generate-restyled.mjs` for the reference
   implementation) or the form is silently broken for real users.
3. Check TTL / extension state: there's no read endpoint for this — either
   fetch the record's `expiresAt` at publish/extend time from the API
   response, or use the pattern in `app/test_persistence.mjs` (publish/extend
   against a **disposable** test id, never a real user's id) to confirm
   expected TTL math (~30 days unextended, ~365 days extended, second extend
   idempotent, bogus id 404s).

## When NOT to use this skill

| You actually need | Sibling skill |
|---|---|
| Editing the SI/prompt, change classification, merge gates, DR-1…DR-12 in full | forms-restyler-change-control |
| Diagnosing a broken flow (stuck generation, CORS errors, wedged dev server, OAuth 403) | forms-restyler-debugging-playbook |
| Running the eval pipeline itself (`run.mjs`, `generate-restyled.mjs`, manifest shards) | forms-restyler-eval-pipeline |
| Env vars, `.env.local` contents, how to pull them from Vercel, local setup from scratch | forms-restyler-build-and-env |
| Model IDs, image-model config, feature flags | forms-restyler-config-and-flags |
| System architecture, API contracts, request/response shapes | forms-restyler-architecture-contract |
| Google Forms scraping/API internals (`FB_PUBLIC_LOAD_DATA_`, entry names) | google-forms-internals-reference |
| Full incident narratives behind the facts cited here | forms-restyler-failure-archaeology |

## Provenance and maintenance

Written 2026-07-19. Read-only investigation; no code, config, or repo state
was changed to produce this skill.

Sources: `app/app/api/publish/route.ts`, `app/app/api/forms/[id]/extend/route.ts`,
`app/app/api/cron/sweep-blobs/route.ts`, `app/app/api/submit/[formId]/route.ts`,
`app/app/f/[id]/route.ts`, `app/lib/store.ts`, `app/vercel.json`,
`app/app/api/generate/route.ts`, `app/app/page.tsx`,
`app/components/UrlBar.tsx`, `app/components/ChatPanel.tsx`,
`app/test_persistence.mjs`, `app/test_redis.mjs`, `app/package.json`,
`documentation/persisted-forms.md`, `documentation/screenshot-production.md`,
git commit `a972970` ("Trigger rebuild with correct root directory"), and a
live read-only check of `https://app-red-phi-88.vercel.app/` (200) and
`https://app-red-phi-88.vercel.app/f/nonexistent-id` (404) on 2026-07-19.

Volatile facts to re-verify before relying on them:

| Fact (as of 2026-07-19) | Re-verify with |
|---|---|
| Prod domain is `app-red-phi-88.vercel.app` and builds from `main` | `curl -o /dev/null -w '%{http_code}' https://app-red-phi-88.vercel.app/`; `git log --oneline --merges main \| head` |
| Default TTL 30 days, extend to 365 days, one-time | `grep -n "TTL_SECONDS\|EXTENDED_TTL_SECONDS\|extended" app/lib/store.ts` |
| Cron schedule `0 3 * * *` on `/api/cron/sweep-blobs` | `cat app/vercel.json` |
| Sweeper safety window is 1 hour | `grep -n "SAFETY_WINDOW_MS" app/app/api/cron/sweep-blobs/route.ts` |
| Submit URL baked from generating origin at `/api/generate` line ~61 | `grep -n "submitUrl" app/app/api/generate/route.ts` |
| Screenshot 501 fallback message and prod Chromium approach unchanged | `cat documentation/screenshot-production.md` |
| No repo-root `vercel.json`; project root is `app/` | `ls vercel.json 2>&1; cat app/vercel.json` |
| Extend has no auth beyond knowing the id | `cat app/app/api/forms/[id]/extend/route.ts` |
