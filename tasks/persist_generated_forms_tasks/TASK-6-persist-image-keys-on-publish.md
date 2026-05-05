# TASK-6: Persist image blob keys on the form record at publish time

## Status
Not started

## Phase
Phase 4 — Image Lifecycle + Quality

## Priority
P0

## Description
When a form is published, capture the Vercel Blob keys for every image embedded in the form HTML and persist them as `imageKeys` on the `PublishedForm` record. This gives the sweeper (TASK-7) an authoritative form → blobs link, so it can delete blobs when the form expires.

## Requirements
- Image generation flow (`app/lib/image-gen.ts`) returns the blob key (not just the public URL) for each generated image, and the generation pipeline keeps these keys reachable through to publish.
- Publish handler (`app/api/publish/route.ts`) writes `imageKeys: string[]` onto the record before calling `save()`.
- Order/duplication: keys are stored as a deduplicated, order-independent set (a JSON array is fine, but writes go through `Array.from(new Set(...))`).
- For forms with no images (image dropdown set to "No images"), `imageKeys` is `[]`.
- Pre-feature records (no `imageKeys` field) are left alone — the sweeper does not retroactively assign keys to them.

## Acceptance Criteria
- [ ] `app/lib/image-gen.ts` (or its caller) surfaces blob keys alongside URLs.
- [ ] `app/api/publish/route.ts` populates `record.imageKeys` before `save(id, record)`.
- [ ] Publishing a form with 2 images results in `imageKeys.length === 2` and each entry corresponds to a real blob.
- [ ] Publishing a form with no images results in `imageKeys: []`.
- [ ] Republishing or editing a form does not duplicate keys for the same blob.

## Technical Notes
- `put()` in `@vercel/blob` returns a `pathname` (the key) along with the URL — capture both at the call site in `app/lib/image-gen.ts:99-102`.
- Keys flow: image generation → form generation pipeline → publish handler. Decide where they live in transit (e.g. an additional field on whatever `GeneratedImage` shape already carries the URL).
- Important: if the same blob ends up referenced by multiple forms (e.g. if a future feature shares blobs across forms), the sweeper will need to be careful. For this feature, assume blobs are 1:1 with the form that generated them.

## Dependencies
- TASK-2 (`imageKeys` field on record).

## Estimated Effort
Medium (~1-2 days; bulk of work is plumbing the key alongside the URL through the existing pipeline).
