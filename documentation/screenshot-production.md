# Website Screenshot Feature — Production Status

## What it does

The Style Guide dialog has a "Use a website" option that captures a screenshot of any URL. The screenshot is sent to Gemini as a visual style reference so the AI can match the look and feel of an existing site.

**Route:** `POST /api/screenshot`

## Current status

| Environment | Status | How it works |
|---|---|---|
| Local dev | Working | Uses `puppeteer` which downloads and bundles a full Chrome binary |
| Vercel (production) | Partially working | Uses `@sparticuz/chromium` + `puppeteer-core` for a serverless-compatible Chromium binary |

### Why it may fail on Vercel

1. **Binary size limits** — `@sparticuz/chromium` ships a compressed Chromium binary (~50 MB). Vercel's serverless function size limit is 50 MB (compressed). If the function bundle plus Chromium exceeds this, deployment fails or the function crashes at runtime.

2. **Execution timeout** — Vercel's free tier has a 10-second function timeout. Launching Chromium, navigating to a page, and waiting for `networkidle2` can exceed this on complex sites. The route currently sets a 15-second page load timeout, which is already over Vercel's free tier limit.

3. **Memory limits** — Chromium is memory-hungry. Vercel free tier provides 1024 MB per function. Heavy pages may cause OOM crashes.

### Fallback behaviour

If Chromium fails to launch, the route returns a `501` response:
```json
{ "error": "Website screenshot is not available in this environment. Use image upload instead." }
```

The image upload path (manual upload in the Style Guide dialog) always works regardless of environment.

## How to make it reliable in production

### Option A: External screenshot API (recommended for prototype)

Replace the Puppeteer-based implementation with a third-party screenshot service:

- **ScreenshotOne** (screenshotone.com) — simple REST API, free tier available
- **Urlbox** (urlbox.io) — similar, good quality
- **Microlink** (microlink.io) — open-source option

Implementation: replace the Puppeteer block in `app/api/screenshot/route.ts` with a single `fetch()` call to the API. Pass the URL, receive a PNG. No binary dependencies.

### Option B: Vercel Pro + larger function limits

Upgrade to Vercel Pro ($20/month) which provides:
- 60-second function timeout (vs 10 seconds on free)
- 3008 MB memory (vs 1024 MB on free)
- 250 MB function size limit (vs 50 MB on free)

The current `@sparticuz/chromium` implementation should work reliably on Pro tier without code changes.

### Option C: Separate screenshot microservice

Deploy a dedicated screenshot service on a platform that supports long-running processes:
- **Railway** or **Render** — persistent Node.js server running Puppeteer
- **Google Cloud Run** — container-based, good for Puppeteer workloads
- **AWS Lambda with container images** — up to 10 GB image size, 15-minute timeout

The main app calls this service via HTTP instead of running Puppeteer in-process.

## Files involved

- `app/app/api/screenshot/route.ts` — the screenshot route
- `app/components/StyleGuideDialog.tsx` — UI that calls the route (via "Use a website" mode)
- `package.json` — `puppeteer`, `puppeteer-core`, `@sparticuz/chromium` dependencies
