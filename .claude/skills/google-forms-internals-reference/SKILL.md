---
name: google-forms-internals-reference
description: Load when working with FB_PUBLIC_LOAD_DATA_, Google Forms entry IDs, the bracket-depth form scraper, submission proxying to formResponse, the Google Forms API v1 (forms.create/batchUpdate), OAuth for that API, or the responder-page footer contract. Triggers — "scrape a Google Form", "FB_PUBLIC_LOAD_DATA_", "entry.XXXXXXXXX", "formResponse", "why did scraping return 0 questions", "Forms API 403/setPublishSettings", "footer / wordmark / Contact form owner", "checkbox array submission", "type code", "viewform URL".
---

# Google Forms Internals Reference

Google Forms has no documented public API for reading a form's structure, and
its submission endpoint is unofficial. This skill is the domain-theory pack
this repo relies on: what the responder page actually contains, how this
repo's scraper (`app/lib/scraper.ts`) parses it, how submission is proxied,
how the footer is reproduced, and how the separate, *official* Forms API v1 is
used on the eval-tooling side (`evals/tools/lib/gforms.mjs`). Every claim below
is either read directly from this repo's source or verified live against a
real Google Form on 2026-07-19 (see Provenance).

Zero-context primer: a "Google Form" has two unrelated faces. (1) The public
**responder page** (`.../viewform`) — an HTML page a human fills out; its data
model is an undocumented, minified JS blob (`FB_PUBLIC_LOAD_DATA_`) that this
project's app scrapes. (2) The **Forms API v1** (`forms.googleapis.com`) — a
documented, authenticated REST API for *creating and editing* forms in a
Google account; this project's eval tooling uses it to build the eval-set
forms. They are separate systems with separate index maps — do not mix them
up. Sections 1-5 below are about the responder page; section 6 is the API.

## When NOT to use this skill

- You're changing the SI prompt text itself (wording, rule ordering) rather
  than verifying a structural fact about Google's page format →
  `forms-restyler-si-engineering`.
- You're triaging a live symptom ("scrape returned 0 questions", "submit
  fails", "OAuth 403") → `forms-restyler-debugging-playbook` has the
  symptom-to-fix table; come here only for the *why* behind the fix.
- You want the incident narrative (how INC-11/INC-12/INC-1/INC-2 were found)
  rather than the current ground truth → `forms-restyler-failure-archaeology`.
- You're touching Redis/Blob/publish/deploy mechanics, not Google's data
  formats → `forms-restyler-architecture-contract` or
  `forms-restyler-run-and-operate`.
- You're about to actually edit code/prompts covered by any of the above →
  load `forms-restyler-change-control` first regardless of which reference
  skill you also used.

---

## 1. Anatomy of a public responder page

**URL shape:** `https://docs.google.com/forms/d/e/{formId}/viewform` — the
`/d/e/` segment (not `/d/`) marks the *published, publicly-shareable* form ID,
distinct from the form's internal edit ID. This project's scraper extracts
`formId` from the input URL with the regex `/\/forms\/d\/e\/([^/]+)\//`
(`app/lib/scraper.ts:91`) — if a user pastes an editor URL (`/forms/d/{id}/edit`)
instead of a viewform URL, this regex does not match and `formId` becomes `""`.

The page is server-rendered HTML with a `<script>` block containing a global
JS variable assignment:

```
FB_PUBLIC_LOAD_DATA_ = [null, [ ... entire form structure as nested arrays ... ]]
```

This is **not part of any published Google API** — it is Forms' internal
client-side hydration payload, left unminified enough to be readable, and
undocumented. Consequences: Google can change the index layout or variable
name at any time without notice; there is no versioning or deprecation
warning; the only defense is the live-verification habit in this skill's
Provenance section and the eval pipeline's own verify step
(`evals/tools/lib/verify.mjs`, run after every eval form is published — see
§3). Do not treat any index below as a permanent contract; treat it as "true
as of the date stamped."

Confirmed live 2026-07-19 against a form created by this repo's own eval
tooling: `curl -A "<desktop UA>" https://docs.google.com/forms/d/e/{id}/viewform`
returns HTTP 200 with exactly one `FB_PUBLIC_LOAD_DATA_` occurrence in the
page, and the blob opens with the shape:

```
FB_PUBLIC_LOAD_DATA_ = [null,["<description>",[[<id>,"<question text>",null,<typeCode>,[[<entryId>,null,<required>]],...],...],...
```

## 2. The confirmed index map

Ground truth: `app/lib/scraper.ts` (function `normalise`), cross-checked
against `documentation/architecture.md` and the live blob above. `raw` is the
full parsed `FB_PUBLIC_LOAD_DATA_` array; `meta = raw[1]`.

| Path | Meaning | Repo evidence |
|---|---|---|
| `raw[1][0]` | Form description (string, `""` if none) | `scraper.ts:96` |
| `raw[1][1]` | Questions array | `scraper.ts:98` |
| `raw[1][8]` | Form title (string; falls back to `"Untitled Form"`) | `scraper.ts:95` |

Per question `q` inside `raw[1][1]`:

| Path | Meaning | Repo evidence |
|---|---|---|
| `q[0]` | Question ID (opaque number; stringified, or `Math.random()` if absent — the ID is never used for submission, only as a React-style key) | `scraper.ts:109` |
| `q[1]` | Question text | `scraper.ts:103` |
| `q[3]` | Type code (see table below) | `scraper.ts:104` |
| `q[4][0]` | The "answer definition" array — everything else is read off this sub-array | `scraper.ts:111` |
| `q[4][0][0]` | Entry ID number. Prefix with `entry.` to get the submittable field name (`entry.1100682473`) | `scraper.ts:112` |
| `q[4][0][1]` | Options array (multiple_choice / checkboxes / dropdown only); each option is itself `[label, ...]`, scraper reads `o[0]` | `scraper.ts:116-117` |
| `q[4][0][2]` | Required flag — `1` means required; scraper checks strict equality `=== 1` (`0`, `null`, `undefined` all mean optional) | `scraper.ts:113` |
| `q[4][0][3][0]`, `q[4][0][3][1]` | linear_scale only: `scaleMin`, `scaleMax` (default 1, 5 if absent) | `scraper.ts:129-130` |
| `q[4][0][4][0]`, `q[4][0][4][1]` | linear_scale only: `scaleMinLabel`, `scaleMaxLabel` | `scraper.ts:131-132` |

**Full type-code table** (`TYPE_MAP` in `scraper.ts:30-39`) — this is the
complete set the scraper recognizes, nothing more:

| Code | `FormQuestion.type` |
|---|---|
| 0 | `short_answer` |
| 1 | `paragraph` |
| 2 | `multiple_choice` |
| 3 | `dropdown` |
| 4 | `checkboxes` |
| 5 | `linear_scale` |
| 9 | `date` |
| 10 | `time` |

Any type code not in this table (Google also uses codes for grids/matrix
questions, file upload, and a "title/section" pseudo-item, among others —
their exact numeric codes are not recorded anywhere in this repo, so do not
invent them) maps to `"unknown"` and the question is **silently dropped**
(`scraper.ts:105-107`, `if (type === "unknown") continue`). This is why a
source form with a file-upload or grid question comes out of `/api/scrape`
with fewer questions than the original — expected behavior, not a bug (see
`forms-restyler-debugging-playbook` if this surprises you at triage time).

## 3. Extraction technique

**Why a bracket-depth walker, not regex.** `FB_PUBLIC_LOAD_DATA_`'s value is a
deeply nested JSON array (arrays of arrays of arrays, several levels deep). A
non-greedy regex like `/\[[\s\S]*?\]/` matches up to the *first* `]`, which is
almost always an inner array closing, not the outer one — it truncates the
payload. `scraper.ts:61-76` instead scans character-by-character from just
after the `FB_PUBLIC_LOAD_DATA_ = ` marker, incrementing a depth counter on
`[` and decrementing on `]`, and takes the full slice when depth returns to 0.
Then `JSON.parse()`s that slice directly — the blob is valid JSON (uses `null`
for gaps, not JS-only syntax), so no custom parser is needed once the bounds
are found correctly.

**Encoding quirks inside the blob.** Google escapes `&`, `<`, `>` inside the
embedded JSON using JS unicode escapes so the payload doesn't collide with the
surrounding `<script>` tag parsing: `&` → `&`, `<` → `<`, `>` →
`>`. Separately, in plain-HTML contexts elsewhere in the page the same
character can appear as an HTML entity, `&` → `&amp;`. This project's scraper
doesn't need to unescape these — `JSON.parse` on the raw slice already yields
correctly-decoded JS strings (the `&` sequences are standard JSON/JS
unicode escapes, not something bespoke). But the **eval pipeline's own
verifier** has to search the *raw, unparsed* page HTML for a question's text
string it generated separately, so it must try every encoding a given
character could appear in. `evals/tools/lib/verify.mjs`'s `candidates(s)`
function (this is INC-11's fix) tries, for a given expected string `s`:

1. `s` itself (raw, unescaped)
2. `JSON.stringify(s)` inner content (standard JSON escaping)
3. that JSON form with `&`/`<`/`>` further replaced by `&`/`<`/`>`
4. `s` with `&` replaced by `&amp;` (HTML-entity form)

and accepts a match if the live page's HTML contains any of the four. If you
write a new tool that greps the raw responder HTML for known question text,
reuse or replicate this candidate list — a naive single-form `includes()`
check will intermittently fail on any question containing `&`, `<`, or `>`
(ampersands are common in real business names, e.g. "Smith & Sons").

## 4. Submission protocol

**Endpoint URL shape:**
`https://docs.google.com/forms/d/e/{formId}/formResponse` — same `{formId}` as
the viewform URL, path segment swapped. This is an unofficial, undocumented
endpoint (no Forms API equivalent for "submit as an anonymous respondent" —
the API is for form *management*, not response submission).

**Field naming:** every answerable field is POSTed as `entry.{entryId}` where
`entryId` is the number scraped from `q[4][0][0]` (§2). This is exactly the
`name` attribute the generated HTML's `<input>`/`<select>`/etc. must carry
(SI rule 4 in `app/lib/gemini.ts`, `buildSystemPrompt`) and exactly the key
the client-side JS sends to this project's own proxy.

**Checkbox arrays — repeated params, not comma-joined.** A `checkboxes`
question that allows multiple selections must be submitted as **multiple
separate `entry.XXXXXXXXX` params with the same key**, one per selected
option — never a single comma- or delimiter-joined value. This repo's proxy
(`app/app/api/submit/[formId]/route.ts:24-28`) enforces this: it detects
`Array.isArray(value)` and calls `formData.append(key, v)` once per array
element, producing a `URLSearchParams` body with duplicate keys — the same
shape a native Google Forms checkbox `<input>` group produces. The client-side
generated HTML is told (SI rule 5) to send checkbox values as a JSON array in
the request body to this project's proxy; the proxy is what fans them out into
Google's expected repeated-param form. If you ever bypass the proxy and POST
straight to `formResponse`, you must do this fan-out yourself.

**Success signals: HTTP 200, 302, or 0.** `route.ts:46` treats all three as
success. 200 = Google served content in place (rare for `formResponse`); 302 =
redirect to the form's "response recorded" page (the common case, but the
proxy calls `fetch(..., { redirect: "manual" })` so it doesn't follow it —
that's deliberate, following it would just download the thank-you HTML for no
reason); 0 = an *opaque* response status, which some runtimes report for a
redirect encountered under certain fetch configurations. Any other status is
treated as failure and logged with the outgoing body and Google's response
text for debugging (`route.ts:50-55`).

**Why a server-side proxy exists at all (two independent reasons):**
1. **CORS.** `docs.google.com` does not send `Access-Control-Allow-Origin`
   headers permitting arbitrary origins to POST to `formResponse` via
   browser `fetch` — a direct client-side POST from the generated form's
   origin would be blocked by the browser before Google even sees it.
2. **`srcdoc` iframe = null origin (INC-14).** Generated forms are previewed
   and served inside `srcdoc` iframes, whose effective origin is the string
   `"null"`, not the parent page's origin. Browsers send a CORS *preflight*
   (`OPTIONS`) for this even when the destination is same-machine localhost.
   `app/app/api/submit/[formId]/route.ts` handles `OPTIONS` explicitly
   (`route.ts:10-12`) and stamps `Access-Control-Allow-Origin: *` plus the
   allowed methods/headers on **every** response — success and error alike —
   so both the preflight and the real POST succeed regardless of what origin
   the generated form's iframe reports.

The proxy is therefore load-bearing infrastructure, not an optional
convenience layer — removing it breaks submission from every generated form,
not just ones with checkboxes.

## 5. The responder footer contract

Rubric-relevant: the eval rubric (`evals/rater_instructions.md`, Dimension 2)
explicitly checks that generated forms reproduce this footer. Ground truth is
`buildGoogleFormsFooter(formId)` in `app/lib/gemini.ts:109-117`, verified live
2026-07-19 against a real responder page (the notice text and abuse-link
shape below were confirmed present verbatim in the live HTML).

The canonical footer this project's SI interpolates verbatim into every
generation (`app/lib/gemini.ts:164`, SI rule 18) is:

| Element | Exact text / target | Notes |
|---|---|---|
| Password notice | "Never submit passwords through Google Forms." | Own line |
| Disclaimer | "This content is neither created nor endorsed by Google." | Followed by 3 links, `-`-separated |
| Link 1 | "Contact form owner" → `https://docs.google.com/forms/d/e/{formId}/viewform` | The *original source form's* viewform URL — same `{formId}` the whole page is about |
| Link 2 | "Terms of Service" → `https://policies.google.com/terms` | Static, not per-form |
| Link 3 | "Privacy Policy" → `https://policies.google.com/privacy` | Static, not per-form |
| Abuse notice | "Does this form look suspicious?" then link "Report" → `https://docs.google.com/forms/d/e/{formId}/abuse` | `/abuse`, same `{formId}` path shape as viewform/formResponse |
| Wordmark | "Google" (font-weight 500) + space + "Forms" (font-weight 400), grey `#5f6368`, 20px | **Plain styled text — never an icon, logo image, or SVG.** This was the exact defect INC-8 fixed. |

Structural details load-bearing for mobile rendering (INC-7): the footer's
inline sizes are fixed pixel values — 12px for the three notice lines, 20px
for the wordmark — set directly in the HTML the function emits, and SI rule 6
(the ≥16px-on-mobile minimum for question/option/input text) explicitly
carves out an exemption for this footer so it doesn't get scaled up by a
generic "make text readable on mobile" instinct. The `<footer>` element itself
carries a `data-gforms-footer` attribute — a marker for a future automated
validator (see `forms-restyler-drift-elimination-campaign`), not consumed by
anything today.

The SI's rule 18 permits Gemini to restyle the footer's spacing, alignment,
font *size within limits*, and color-muting to match the generated form's
theme, but forbids changing notice wording, link labels, link URLs, or the
wordmark text/weights — and requires the footer appear on at least the first
and final steps of multi-step layouts.

## 6. Google Forms API v1 (eval-tooling side)

This is a different, *documented* Google API, used only by `evals/tools/` to
programmatically create the 37-item eval set's source forms in the user's own
Google account — it has nothing to do with how the deployed app scrapes or
submits forms. Ground truth: `evals/tools/lib/gforms.mjs`.

**Question-type mapping** (`toCreateItemRequest`, `gforms.mjs:22-65`) — the
same 8 types as `TYPE_MAP` in §2, mapped to Forms API request shapes:

| This repo's type | API request shape |
|---|---|
| `short_answer` | `textQuestion: { paragraph: false }` |
| `paragraph` | `textQuestion: { paragraph: true }` |
| `multiple_choice` | `choiceQuestion: { type: "RADIO", options: [...] }` |
| `checkboxes` | `choiceQuestion: { type: "CHECKBOX", options: [...] }` |
| `dropdown` | `choiceQuestion: { type: "DROP_DOWN", options: [...] }` |
| `linear_scale` | `scaleQuestion: { low, high, lowLabel?, highLabel? }` |
| `date` | `dateQuestion: {}` |
| `time` | `timeQuestion: {}` |

Any other type throws `unsupported type ${q.type}` (`gforms.mjs:57`) — the
eval recreation step (`evals/tools/lib/recreate.mjs`) is constrained to only
ever emit these 8, so this should never fire in practice.

**Creation flow** (`createGoogleForm`, `gforms.mjs:68-100`):
1. `forms.forms.create({ requestBody: { info: { title, documentTitle } } })` —
   creates an **empty, unpublished** form; only `title`/`documentTitle` may be
   set at creation time (the API rejects other `info` fields here).
2. `forms.forms.batchUpdate(...)` with one `updateFormInfo` request (sets
   `description`, if present) followed by one `createItem` request per
   question, each carrying an explicit `location: { index }` to control
   ordering.
3. `forms.forms.setPublishSettings({ requestBody: { publishSettings: {
   publishState: { isPublished: true, isAcceptingResponses: true } } } })` —
   **required**: forms created via the API start unpublished/private; without
   this call the responder URL 404s or redirects to a login wall, and the
   app's scraper (§1) cannot read it. This method **does not exist** in
   `googleapis@144` (INC-2) — the eval tooling pins `googleapis@^173.0.0`
   (`evals/tools/package.json`) specifically for this. If you see
   `forms.forms.setPublishSettings is not a function`, check the installed
   `googleapis` version first.
4. `forms.forms.get({ formId })` to read back `responderUri` for the manifest.

**OAuth: `forms.body` scope, Desktop-app loopback flow.** `evals/tools/auth.mjs`
requests exactly one scope, `https://www.googleapis.com/auth/forms.body`
(`auth.mjs:12`) — sufficient for create/read/update of form *content and
structure*; it is not the same as a "forms.responses" scope and grants no
access to response data. Auth is a one-time interactive flow: `auth.mjs`
starts a local HTTP server on `127.0.0.1:53682`, opens
`oauth2.generateAuthUrl(...)` for the user to approve in a browser, and the
provider redirects back to `http://127.0.0.1:53682/oauth2callback` with a
code that gets exchanged for tokens and cached at
`evals/tools/credentials/token.json`. This loopback pattern requires the
downloaded OAuth client credentials to be of type **Desktop app** (not
"Web application" — a Web client won't allow an arbitrary-port loopback
redirect URI) — `auth.mjs:24` reads `raw.installed ?? raw.web`, and
`installed` is the key name Google's JSON uses for Desktop-app clients
specifically.

**Same-GCP-project requirement (INC-1).** The single most confusing failure
in this whole subsystem: `client_secret.json`'s client ID and the OAuth
consent screen being edited must belong to the **same GCP project**. A
`client_secret.json` downloaded from a different project than the one whose
consent screen was configured (test users added, app published) produces
`Error 403: access_denied` that persists no matter what is changed on the
consent screen — because the token exchange is validating against the
*client's* project, not the project the human was looking at in the console.
Diagnostic: compare the `client_id` prefix in `client_secret.json` against
the client list on the Credentials page of the project you *think* you
configured — a mismatch is the tell. `evals/tools/README.md` carries this
warning inline in the setup steps.

## 7. Constraints discovered the hard way (INC-12)

Google Forms API option-count rules are asymmetric and undocumented until you
hit them: `multiple_choice` (RADIO) and `dropdown` (DROP_DOWN) questions
require **≥ 2 options** — the API rejects a create/update request for a
1-option radio or dropdown. `checkboxes` (CHECKBOX) has no such floor: **1
option is legal** (this is how consent/acknowledgement checkboxes like "I
agree to the terms" are legitimately modeled). The eval recreation step hits
this because Gemini sometimes emits a consent-style item as a 1-option
`multiple_choice` or `dropdown`. Fix, in `evals/tools/lib/recreate.mjs`'s
`validateStructure`:

```js
// consent/acknowledgement items sometimes come back as 1-option
// multiple_choice or dropdown — coerce to checkboxes, where 1 option is legal.
if (["multiple_choice", "dropdown"].includes(q.type) && Array.isArray(q.options) && q.options.length === 1) {
  q.type = "checkboxes";
}
// ...then validate:
const min = q.type === "checkboxes" ? 1 : 2;
if (!Array.isArray(q.options) || q.options.length < min)
  throw new Error(`question ${i + 1} (${q.type}) needs >= ${min} options`);
```

If you write any other code path that creates or edits `multiple_choice`/
`dropdown` questions via the Forms API (or via the app's own scraper-to-API
round trip, if that's ever built), apply the same coercion or the
`batchUpdate` call fails outright for that question.

---

## Provenance and maintenance

**Date-stamped as of: 2026-07-19.** Everything above involving Google's
undocumented `FB_PUBLIC_LOAD_DATA_` format (§1-3, §5) is fragile by
definition — Google owns it, ships no changelog for it, and this repo has no
automated check that would catch a silent format change except the eval
pipeline's own verify step. Everything involving the documented Forms API v1
(§6-7) is comparatively stable but still versioned by `googleapis` client
version — re-check the CHANGELOG on any `googleapis` bump in
`evals/tools/package.json`.

**Sources:**
- `app/lib/scraper.ts` (index map, bracket-depth walker, type table)
- `app/app/api/submit/[formId]/route.ts` (submission proxy, CORS, status codes)
- `app/lib/gemini.ts` (`buildGoogleFormsFooter`, SI rules 4-6 and 18)
- `evals/tools/lib/gforms.mjs` (Forms API create/batchUpdate/publish mapping)
- `evals/tools/lib/verify.mjs` (`candidates()` encoding variants)
- `evals/tools/auth.mjs` (OAuth scope, loopback flow, client type)
- `evals/tools/README.md` (setup steps, INC-1 warning inline)
- `documentation/architecture.md` (independent corroboration of the index map
  and data-flow diagrams)
- Live verification performed 2026-07-19: `curl` against
  `https://docs.google.com/forms/d/e/{a form created by this repo's own eval
  tooling}/viewform` — confirmed HTTP 200, exactly one `FB_PUBLIC_LOAD_DATA_`
  occurrence, the `raw[1][0]`/`raw[1][1]` shape, `entry.{number}` field names
  matching the API-created question order, and the exact footer notice text
  and `/abuse` link shape from §5. The `&`/`<`/`>` escape-variant claims in §3
  are taken directly from `verify.mjs` source (not independently reproduced
  live in this session — none of the spot-checked live forms contained those
  characters in question text); re-verify against a form whose questions
  contain `&` before relying on this claim in a new tool.

**Re-verification commands** (read-only, safe to run any time):

```bash
# Confirm FB_PUBLIC_LOAD_DATA_ still present and check its opening shape,
# against any known-public Google Form URL you have on hand:
curl -s -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" \
  "https://docs.google.com/forms/d/e/{formId}/viewform" \
  | grep -o "FB_PUBLIC_LOAD_DATA_ = .\{0,300\}"

# Confirm the footer notice text and abuse-link shape are unchanged:
curl -s -A "Mozilla/5.0 ..." "https://docs.google.com/forms/d/e/{formId}/viewform" \
  | grep -o "Never submit passwords[^<]*\|neither created nor endorsed by Google[^<]*\|forms/d/e/[^\"']*abuse"

# Confirm googleapis still exposes setPublishSettings (INC-2 regression check):
node -e "const {google}=require('googleapis'); console.log(typeof google.forms('v1').forms.setPublishSettings)"
# (run from evals/tools/, expects "function")
```

If either curl comes back without a match, do not assume the code is broken —
first re-check the target form is actually public (an org-restricted or
unpublished form redirects to a Google login page and simply won't contain
this data at all), then treat a genuine format change as an emergency: it
would silently break `/api/scrape` for every user of the deployed app.
