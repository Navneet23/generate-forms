# Task 03 — Baseline Preview

## Status
`Done`

## Description

When a creator loads a Google Form URL into the tool, the preview pane should immediately show the original Google Form exactly as it looks — before any AI generation has happened. This is achieved by embedding the original form URL in an iframe.

The creator uses this as a visual reference for what they are improving. Once the first AI generation completes, the iframe is replaced by the AI-generated form (Task 05).

**Inputs:**
- The public Google Form URL entered by the creator

**Outputs:**
- Original Google Form rendered in an iframe in the preview pane

**Implementation notes:**
- Use the standard Google Form URL directly as the iframe `src` — no modification needed
- The iframe is read-only from the parent page (cross-origin); this is expected and fine for preview purposes
- The iframe should match the preview pane dimensions and respond to the desktop / mobile width toggle
- Once the first AI-generated HTML is ready, replace the iframe with the sandboxed AI preview (Task 05) — the original iframe is no longer needed
- No custom rendering required; this task is intentionally simple
