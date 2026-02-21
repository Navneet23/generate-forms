# Task V2-08 — Website Screenshot API

## Status
`Done`

## Description

Build a server-side endpoint that takes a website URL, captures an above-the-fold screenshot using Puppeteer, and returns the screenshot as a base64 image. Used by the Style Guide dialog when a creator provides a website as their style reference.

**Endpoint:** `POST /api/screenshot`

**Request:**
```json
{ "url": "https://stripe.com" }
```

**Response:**
```json
{ "imageBase64": "data:image/png;base64,..." }
```

**Implementation:**
- Install `puppeteer` as a dependency
- Launch a headless browser, navigate to the URL, wait for network idle, capture a viewport screenshot (1280×800)
- Return the screenshot as a base64 PNG
- Screenshot is ephemeral — not saved to disk, returned directly in the response

**SSRF protection (required):**
Before making any request to the provided URL, validate that it resolves to a public IP:
- Reject URLs with private IP ranges: `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`
- Reject loopback: `127.x.x.x`, `localhost`, `::1`
- Reject non-http/https schemes
- Perform DNS resolution server-side and check the resolved IP before launching Puppeteer

**Error handling:**
- Invalid or private URL → 400 with clear error message
- Puppeteer navigation timeout (>15s) → 408 with "Website took too long to load"
- Bot detection / blank page → return the screenshot anyway (accepted limitation); do not attempt to detect or retry
- Puppeteer crash → 500 with generic error

**Known limitations (accepted):**
- Cookie consent overlays will appear in the screenshot
- JS-heavy SPAs may capture a partially hydrated state despite `waitUntil: networkidle`
- Sites with bot detection (Cloudflare, etc.) may return a challenge page instead of content

**Files to create:**
- `app/api/screenshot/route.ts`

**Dependencies:**
- `puppeteer` npm package
