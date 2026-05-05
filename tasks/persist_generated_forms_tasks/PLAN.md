# Implementation Plan: Persisted Generated Forms

## Overview

This plan covers extending generated form retention from 7 days to 30 days by default, adding a one-time post-publish "Keep it for 1 year" option, and aligning Vercel Blob image lifecycles with form lifecycles. The feature spans backend (TTL change, extend endpoint, record schema, sweeper) and frontend (publish success area: expiry date + extend action).

**Total tasks: 9**
**Phases: 4**

Authoritative requirements: `requirements/persist-generated-forms.md`.

---

## Phases Table

| Phase | Name | Tasks | Description |
|-------|------|-------|-------------|
| 1 | Storage Foundation | TASK-1, TASK-2 | Bump default TTL; extend `PublishedForm` schema with `expiresAt`, `extended`, and image keys |
| 2 | Extension API | TASK-3 | New `POST /api/forms/[id]/extend` endpoint with one-time idempotent semantics |
| 3 | Frontend | TASK-4, TASK-5 | Show concrete expiry date + "Keep for 1 year" action inline on publish success area |
| 4 | Image Lifecycle + Quality | TASK-6, TASK-7, TASK-8, TASK-9 | Persist image keys; orphan-blob sweeper; testing; documentation |

---

## Dependency Graph

```
TASK-1 (default TTL 30d)          TASK-2 (record schema)
                                          |
                            +-------------+--------------+
                            v             v              v
                        TASK-3        TASK-4         TASK-6
                        (extend       (expiry date   (capture image
                         endpoint)     in success)    keys on publish)
                            |             |              |
                            +------+------+              v
                                   v                 TASK-7
                               TASK-5                (sweeper)
                               (wire UI to
                                extend API)
                                   |
                                   v
                               TASK-8 (testing) <--- TASK-3, TASK-5, TASK-7
                                   |
                                   v
                               TASK-9 (docs)
```

**Parallelization opportunities:**
- TASK-1 is independent and can land first/standalone.
- After TASK-2, TASK-3, TASK-4, and TASK-6 can be done in parallel.
- TASK-7 (sweeper) depends only on TASK-6, so can start while TASK-5 frontend work is in flight.

---

## Critical Path

```
TASK-2 -> TASK-3 -> TASK-5 -> TASK-8
```

This chain blocks the user-visible extension flow:
1. **TASK-2** — record schema change (needed by TASK-3 to mark `extended: true`, by TASK-4 to read `expiresAt`).
2. **TASK-3** — extend endpoint (needed by TASK-5 to wire the UI action).
3. **TASK-5** — UI wiring (last user-facing piece).
4. **TASK-8** — testing.

The image-cleanup chain (TASK-6 → TASK-7) runs in parallel and is not on the critical path for the user-facing flow, but is required by FR4.

---

## Risk Mitigation Mapping

| Risk | Severity | Mitigation | Related Tasks |
|------|----------|------------|---------------|
| Sweeper deletes blobs that are still referenced by a live form | High | Sweeper only deletes blobs whose form id is missing from Redis AND whose blob key is not present on any live form record | TASK-6, TASK-7 |
| Sweeper misses orphans (storage growth unbounded) | Medium | Periodic schedule (Vercel Cron) with idempotent logic; document expected lag | TASK-7, TASK-9 |
| User extends, then UI shows wrong expiry due to clock drift | Low | Endpoint returns authoritative `expiresAt`; frontend renders that, not a locally computed date | TASK-3, TASK-4, TASK-5 |
| Race condition: two simultaneous extend calls | Low | Endpoint is idempotent — checks `extended` flag on record before acting; second call is a no-op | TASK-3 |
| Existing forms confuse the sweeper (no image-keys field) | Medium | Sweeper treats missing-field records as "no images to manage" — does not attempt cleanup for pre-feature blobs | TASK-7 |
| Old 7-day forms leave orphan blobs that pre-date this feature | Low (out of scope) | Documented as out of scope in requirements; sweeper does not retroactively clean these up | TASK-9 |

---

## Out of Scope (per requirements doc)

- Authentication / form ownership tokens.
- Migration of pre-existing 7-day forms to 30-day.
- Repeat extensions beyond one 1-year extension per form.
- "Forever" / no-TTL retention.
- Cleanup of blobs orphaned before this feature shipped.
