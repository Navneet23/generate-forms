# Task 07 — Submission Proxy

## Status
`Done`

## Post-build fixes
- Added CORS headers (`Access-Control-Allow-Origin: *`) to all responses
- Added OPTIONS handler for CORS preflight requests
- Required because srcdoc iframes have a null origin, which triggers CORS preflight even for same-host requests

## Description

Build a server-side endpoint that receives form submissions from the AI-generated form and proxies them to the original Google Form's submission endpoint. This is necessary because the browser cannot POST directly to Google Forms from a different origin (CORS).

**Flow:**

```
Respondent submits custom form
        ↓
POST to /api/submit/{formId}  (your server)
        ↓
Your server maps field values to entry.XXXXXXXXX IDs
        ↓
POST to https://docs.google.com/forms/d/e/{formId}/formResponse
        ↓
Response lands in original Google Sheet
        ↓
Return success or error to respondent
```

**Inputs (from AI-generated form):**
- `formId`: the original Google Form ID
- Field values keyed by `entryId` (e.g. `{ "entry.1234567890": "Alice", "entry.9876543210": "Red" }`)

**What the server does:**
- Validates that the `formId` matches a known published form (stored at publish time — Task 08)
- Retrieves the `entryId` map stored at publish time
- Constructs the POST body for Google's `formResponse` endpoint
- Makes the server-side POST to Google Forms
- Returns a success or failure response to the client

**Success response to respondent:**
- HTTP 200 with a simple JSON `{ "status": "ok" }`
- The AI-generated form's JS handles showing a thank-you message

**Failure handling:**
- Log all failed submissions server-side with the form ID, timestamp, and error
- Return a generic error to the respondent — do not expose Google's raw error response
- Do not retry automatically — let the respondent resubmit if needed

**Implementation notes:**
- Google's `formResponse` endpoint is unofficial and not guaranteed to be stable — isolate the Google POST logic so it can be updated without touching the rest of the proxy
- The `entryId` map must be stored at publish time (Task 08) and retrieved here — the proxy should not re-scrape the form on every submission
- Google may return a redirect (302) rather than a 200 on successful submission — treat a redirect to the form's confirmation URL as a success
- Watch for bot detection or rate limiting from Google at scale — log any unexpected responses for monitoring
