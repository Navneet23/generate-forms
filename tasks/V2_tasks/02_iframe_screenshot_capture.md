# Task V2-02 — Iframe Screenshot Capture (html2canvas bridge)

## Status
`To Do`

## Description

Capture a specific region of the AI-generated form iframe as a base64 image, triggered by coordinates from the parent page. Since the iframe uses `srcdoc` with `allow-same-origin`, the parent can access `iframe.contentDocument` directly and inject html2canvas without postMessage.

**Flow:**
1. Parent receives selection coordinates `{ x, y, width, height }` from the overlay (Task V2-01)
2. Parent dynamically injects html2canvas into the iframe's document as a script tag
3. Parent calls html2canvas on `iframe.contentDocument.body` with a clip region matching the coordinates
4. html2canvas returns a canvas element
5. Canvas is converted to a base64 PNG string
6. Base64 string is passed back to the chat panel (Task V2-03)

**Implementation notes:**
- Install `html2canvas` as a project dependency: `npm install html2canvas`
- The iframe sandbox attribute must include `allow-same-origin` (already set in MVP) for `iframe.contentDocument` access to work
- Inject html2canvas once per iframe lifetime, not on every capture (check if already injected before adding the script)
- Use html2canvas `clip` option to capture only the selected region, not the full page
- The captured image does not need to be stored — it is ephemeral, passed directly as base64 to the AI

**Files to modify:**
- `components/PreviewPane.tsx`

**Dependencies:**
- `html2canvas` npm package
- Task V2-01 must be complete (provides coordinates)
