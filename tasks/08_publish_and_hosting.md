# Task 08 — Publish and Hosting

## Status
`To Do`

## Description

When the creator is happy with the generated form, they click "Publish". This freezes the current AI-generated HTML, stores it on the server, and returns a unique shareable URL that serves the same form to every respondent.

**Publish flow:**

```
Creator clicks "Publish"
        ↓
Client sends current generated HTML + form metadata to /api/publish
        ↓
Server assigns a unique ID (e.g. nanoid)
Server stores the HTML and entryId map keyed by that ID
Server returns the shareable URL: yourapp.com/f/{id}
        ↓
Creator sees the URL in the toolbar and can copy it
```

**What gets stored per published form:**

| Field | Purpose |
|---|---|
| `id` | Unique identifier for the published form |
| `html` | The frozen AI-generated HTML page |
| `formId` | Original Google Form ID |
| `entryIdMap` | Map of question IDs to `entry.XXXXXXXXX` values — used by submission proxy (Task 07) |
| `createdAt` | Timestamp |

**Serving published forms:**

- `GET yourapp.com/f/{id}` returns the stored HTML directly as `text/html`
- Every respondent gets the same frozen HTML — no re-generation on load
- If the ID does not exist, return a 404 page

**Re-publish behaviour:**
- A creator can publish multiple times during a session (e.g. after further refinement)
- Each publish creates a new unique ID and a new URL
- Old URLs remain valid — they continue to serve their frozen HTML
- The creator's toolbar updates to show the latest published URL

**Implementation notes:**
- For MVP, storage can be a simple file system or a key-value store (e.g. Redis, SQLite, or even flat JSON files) — choose the simplest option that works
- The stored HTML must include the correct submission proxy endpoint URL baked in, so respondents' submissions route correctly
- Do not allow the published HTML to be modified after it is stored — publish is always a new record
