# Persisted Forms — Operational Notes

Default form retention is **30 days**. After publish, a creator can extend a form to **1 year** with a single click in the success area. Extension is one-time and idempotent — once a form is at 1 year, the action is a no-op.

Authoritative spec: `requirements/persist-generated-forms.md`.

---

## Components

| Component | Path |
|---|---|
| Form record + TTL logic | `app/lib/store.ts` |
| Publish endpoint | `app/app/api/publish/route.ts` |
| Extend endpoint | `app/app/api/forms/[id]/extend/route.ts` |
| Frontend success-area UI | `app/app/page.tsx` |
| Image generation (captures blob keys) | `app/lib/image-gen.ts` |
| Orphan-blob sweeper | `app/app/api/cron/sweep-blobs/route.ts` |
| Cron schedule | `app/vercel.json` |

---

## Sweeper

The sweeper deletes Vercel Blob objects whose owning form is no longer alive in Redis. Vercel Blob has no native TTL, so this job is the mechanism that aligns image lifecycles with form lifecycles.

### Schedule
Daily at 03:00 UTC (`vercel.json` → `crons[0]`).

### Algorithm
1. Authenticate the request via `Authorization: Bearer $CRON_SECRET`.
2. Call `listAllImageKeys()` — scans all live form records in Redis and returns the union of their `imageKeys`.
3. Page through every blob in the bucket via `@vercel/blob.list()`.
4. For each blob:
   - Skip if its `pathname` is in the in-use set.
   - Skip if it was uploaded within the last hour (safety window — protects in-flight publishes that haven't yet written the form record).
   - Otherwise, `del(blob.url)`.
5. Log scanned / deleted / skipped-in-use / skipped-fresh / errors.

### Manually invoking
```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
     https://<deployment>/api/cron/sweep-blobs
```

The response is JSON: `{ scanned, deleted, skippedInUse, skippedFresh, errors? }`.

### What the sweeper deliberately does NOT clean up

- **Pre-feature blobs** — images uploaded before this feature shipped, whose form records may have already expired without ever recording `imageKeys`. These are out of scope. To clean them up retroactively would require either listing every blob (and accepting that the sweeper would delete *everything* not currently referenced — including legacy still-live forms whose records lack `imageKeys`) or building a one-time migration tool. Neither was in scope.
- **Blobs younger than 1 hour** — protects in-flight publishes whose form record hasn't been written yet.
- **Blobs referenced by a live form** — even if that blob is no longer embedded in the form's HTML (e.g. Gemini swapped it during refinement). The form's `imageKeys` list is a conservative superset; cleanup waits until the form itself expires.

---

## Extension semantics

- Authorization is by **knowledge of the form id** (no token, no auth). Anyone with the share link can extend.
- Each form may be extended at most once, to 1 year. The `extended` flag on the record enforces this. Subsequent calls to `/api/forms/[id]/extend` return the existing `expiresAt` without changing it.
- Extension writes the `extended: true` flag and the new TTL atomically (single `redis.set` call), so a partial state can't leave a record with a bumped TTL but a stale flag.

---

## Migration of pre-feature forms

Forms published before this feature shipped have a 7-day TTL already running in Redis. **No migration is performed.** They expire on their original schedule. Only forms published after deploy receive the 30-day default.

For these legacy records, `get()` derives `expiresAt` as `createdAt + 7 days` so the publish-time UI still has a date to render if the user re-enters their record (though there's no path to do so in the current UI).
