# Task V2-05 — Image Upload Button (+ Button)

## Status
`To Do`

## Description

Add a **+** button to the chat input bar that lets the creator upload an image to be embedded directly in the form (logo, header photo, background image). The image is uploaded to the server, stored permanently, and the hosted URL is passed to the AI as context so it can reference it in the generated HTML.

**Behaviour:**
- Creator clicks **+** → a small popover appears with one option: "Upload image"
- Clicking "Upload image" opens the system file picker (accept: image/*)
- Selected image is uploaded to `/api/upload` (Task V2-06)
- Server returns a stable hosted URL
- The URL is attached to the next chat message as context: `"The user has uploaded an image to embed in the form. It is hosted at: {url}. Use it as directed in the prompt."`
- A thumbnail also appears in the chat attachment area (same UI as Task V2-03)
- The hosted URL is what the AI uses in generated HTML — never base64 inline

**Important distinction:**
- **+ button** = embed image in form (permanent storage, URL passed to AI)
- **Style guide** = visual reference only (ephemeral, never embedded)

**Files to modify:**
- `components/ChatPanel.tsx`

**Dependencies:**
- Task V2-06 (upload API endpoint must exist)
- Task V2-03 (thumbnail attachment UI)
