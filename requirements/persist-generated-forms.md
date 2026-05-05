# Persisted Generated Forms — Requirements

## Overview

Generated forms (and the images embedded in them) currently persist for 7 days. This feature extends the default retention to **30 days**, and offers users a one-time option after publish to extend a form's life to **1 year**. Image storage is brought into alignment with form storage so images don't outlive the forms that reference them.

---

## Goals

1. Increase default form retention from 7 days to 30 days.
2. Give users an explicit, one-time post-publish option to extend a form to 1 year.
3. Ensure images embedded in a form share the form's lifecycle (no orphaned blobs after a form expires).

---

## Current State (for context)

| Concern | Today |
|---|---|
| Form storage | Upstash Redis, single key per form, value is JSON-encoded `PublishedForm { html, formId, createdAt }` |
| Form TTL | 7 days, set at `app/lib/store.ts:14` via `redis.set(id, ..., { ex: TTL_SECONDS })` |
| Form identity | 10-char nanoid, anonymous (no auth, no ownership tracking) |
| Image storage | Vercel Blob; URLs embedded directly in form HTML |
| Image TTL | None — images live indefinitely, even after the form record expires |
| Publish flow | `POST /api/publish` → `app/page.tsx:42-61` `handlePublish()` → share URL `/f/{id}` rendered inline on the same page |
| Extension mechanism | None |

---

## Functional Requirements

### FR1. Default retention is 30 days

New forms published via `POST /api/publish` are stored with a 30-day TTL on the Redis record (replacing the current 7-day TTL at `app/lib/store.ts:14`).

### FR2. Post-publish "Keep it for 1 year" option

After a successful publish, the inline success area on the same page shows:
- The concrete expiry date (e.g. *"Expires June 4, 2026"*).
- A **"Keep it for 1 year"** action.

When the user clicks the action:
- The form's TTL is extended to 365 days.
- The action is replaced with a confirmed state showing the new expiry date.
- The action cannot be re-triggered for the same form (one-time use).

If the user does not click the action, the form retains the 30-day default.

### FR3. Extend endpoint

A new endpoint, `POST /api/forms/[id]/extend`, sets the Redis TTL of the given form to 365 days.

- **Authorization:** knowledge of the form id is sufficient. No auth, no token.
- **Idempotency:** if called for a form that has already been extended to 1 year, the endpoint returns the existing expiry without shortening it and without granting an additional extension.
- **Response:** new expiry timestamp so the UI can render the confirmed state.

### FR4. Image lifecycle mirrors form lifecycle

When a form expires or is deleted, the Vercel Blob images referenced by that form are deleted as well.

- The form record stores the list of blob URLs (or blob keys) belonging to the form, so the link from form → images survives within the form's lifetime.
- Because Redis TTL expirations don't fire callbacks and Vercel Blob has no native TTL, image cleanup is implemented via a sweeper that compares blobs against live Redis keys and deletes orphans.
- When a form is extended via FR3, its images implicitly remain (they are still referenced by the still-alive form record).

### FR5. Visible expiry information

The publish success view shows the form's concrete expiry date. The displayed date updates after a successful extension (30-day date → 1-year date).

---

## Non-Functional Requirements

### NFR1. No migration of existing forms

Forms published before this feature ships continue to use their original 7-day TTL and expire on the old schedule. Only forms published after deploy receive the 30-day default.

### NFR2. Idempotent, one-time extension

The extend endpoint must:
- Not shorten the remaining TTL of an already-extended form.
- Not grant a second extension on the same form.
- Be safe to call repeatedly without side effects beyond the first successful extension.

### NFR3. Reliable, bounded image cleanup

The image-cleanup sweeper must keep blob storage growth bounded relative to live forms. Acceptable lag between form expiry and image deletion should be documented (e.g. "images are deleted within 24 hours of the parent form expiring").

---

## Out of Scope

- Authentication or per-user form ownership.
- Migration of forms already in Redis at deploy time.
- Repeated or unbounded extensions (each form may be extended at most once, to 1 year).
- "Forever" / no-TTL retention.
- Cleanup of pre-existing orphaned blobs (images uploaded before this feature shipped, whose form records have already expired).
- Owner-token-based authorization for the extend endpoint.
- A "later" path to extend a form after the post-publish success view is dismissed.

---

## Open Decisions Resolved

| Question | Decision |
|---|---|
| Image cleanup on expiry? | Yes — image lifecycle mirrors form lifecycle (FR4) |
| Migrate existing forms to 30-day TTL? | No — new forms only (NFR1) |
| Who can extend? | Anyone with the form id (FR3) |
| One-time vs. repeatable extension? | One-time only (NFR2) |
| UX shape of the post-publish prompt? | Inline on the publish success area, same page (FR2) |
| Exact 1 year vs. forever? | Exactly 1 year (365 days), with the date shown explicitly (FR2 + FR5) |
