# Task 01 — Form Scraper

## Status
`To Do`

## Description

Build a server-side endpoint that accepts a public Google Form URL, fetches the page HTML, and extracts the form structure from the embedded `FB_PUBLIC_LOAD_DATA_` JavaScript variable.

The scraper must run server-side to avoid CORS issues. It should never require the creator to authenticate with Google.

**Inputs:**
- A public Google Form URL

**Outputs:**
- Normalised form structure JSON (consumed by the Structure Normaliser — Task 02)
- A clear error if the form is not publicly accessible or the URL is invalid

**Implementation notes:**
- Make a server-side GET request to the form URL
- Extract the `FB_PUBLIC_LOAD_DATA_` variable from the raw HTML using regex or string parsing
- Parse the variable value as JSON
- Return the raw parsed structure to the normaliser
- `FB_PUBLIC_LOAD_DATA_` is undocumented and may change — isolate the parsing logic so it can be updated in one place if Google changes the format

**Supported question type codes to extract:**

| Code | Type |
|---|---|
| 0 | Short answer |
| 1 | Paragraph |
| 2 | Multiple choice |
| 3 | Checkboxes |
| 4 | Dropdown |
| 5 | Linear scale |
| 9 | Date |
| 10 | Time |

**Error cases to handle:**
- URL is not a Google Form
- Form requires sign-in (returns a redirect instead of form data)
- `FB_PUBLIC_LOAD_DATA_` not found in page HTML
- Network request fails or times out
