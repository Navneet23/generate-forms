# Task 04 — AI Prompt Layer

## Status
`To Do`

## Description

Build the server-side layer that takes the normalised form structure, the creator's text prompt, and the conversation history, constructs a prompt, calls the LLM, and returns a complete self-contained HTML page that renders the styled form.

**Inputs:**
- Normalised form structure JSON (from Task 02)
- Creator's text prompt (from the chat panel)
- Previously generated HTML (for iterative refinement — empty on first call)
- Conversation history (list of prior prompt / response pairs)

**Outputs:**
- A complete, self-contained HTML page (HTML + inline CSS + inline JS) that renders the form with the requested styling

**System prompt responsibilities:**
- Instruct the model to output only valid HTML — no markdown, no explanation, no code fences
- Instruct the model to render all questions from the form structure in order
- Instruct the model to use the correct `entry.XXXXXXXXX` field names on all inputs so the submission proxy (Task 07) can route responses correctly
- Instruct the model to include a submit handler that POSTs to the app's submission proxy endpoint, not directly to Google
- Instruct the model that the output must be self-contained — all CSS and JS must be inline, no external dependencies

**User prompt construction:**
- Include the full normalised form structure as context
- Include the creator's message
- If a previous HTML exists, include it so the model refines rather than regenerates from scratch

**Conversation history:**
- Maintain the last N turns (suggest: 10) in the request to preserve iterative context
- Drop older turns if context window pressure requires it

**Error handling:**
- If the model returns output that is not valid HTML, retry once before returning an error to the client
- Surface a clear error in the chat panel if generation fails

**Implementation notes:**
- Use the Anthropic SDK (Claude Sonnet 4.6 as default for MVP)
- Use structured output or clear prompt constraints to prevent the model from returning anything other than raw HTML
- Keep prompt construction logic modular — it will be extended in V3 to support multiple providers and template image inputs
