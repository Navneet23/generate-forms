# Task V2-06 — Image Upload API Endpoint

## Status
`Done`

## Description

Build a server-side API route that accepts an image file upload, saves it to local disk under `public/uploads/`, and returns a stable URL that can be embedded in generated form HTML. Images must be stored permanently — they are referenced in published forms and must remain accessible for as long as those forms are live.

**Endpoint:** `POST /api/upload`

**Request:** `multipart/form-data` with a single `image` field

**Response:**
```json
{ "url": "/uploads/abc123-filename.jpg" }
```

**Implementation notes:**
- Use Next.js route handler with the Web API `Request.formData()` to read the uploaded file
- Save files to `public/uploads/` — Next.js serves `public/` as static assets automatically, so no additional static server is needed
- Generate a unique filename using nanoid to avoid collisions: `{nanoid()}-{originalname}`
- Accept common image formats: jpg, jpeg, png, gif, webp, svg
- Set a file size limit of 10MB — reject larger files with a 400 error
- Do not delete files automatically — permanent storage is required
- Return a relative URL `/uploads/{filename}` — the AI receives the absolute URL constructed from the request origin

**Security notes:**
- Validate MIME type from file content (not just extension) before saving
- Sanitise the original filename before using any part of it

**Files to create:**
- `app/api/upload/route.ts`

**Files to modify:**
- `.gitignore` — add `public/uploads/` to avoid committing uploaded images to git
