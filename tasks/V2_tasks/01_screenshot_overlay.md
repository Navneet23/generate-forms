# Task V2-01 — Screenshot Selection Overlay

## Status
`Done`

## Description

Add a drag-to-select overlay on the preview pane that lets the creator capture a region of the AI-generated form as an image and attach it to the chat as visual context.

**Behaviour:**
- Overlay is invisible and inactive until the first AI generation completes
- Once active, an instruction hint appears: "Drag to select a region"
- Creator clicks and drags anywhere on the preview pane to draw a selection rectangle
- On mouse release, the selected region coordinates are captured
- The coordinates are sent to the iframe to trigger screenshot capture (Task V2-02)
- The returned base64 image is passed to the chat attachment handler (Task V2-03)
- Overlay resets after each capture so the creator can select again

**Implementation notes:**
- The overlay is a `position: absolute` div sitting above the iframe in the PreviewPane component
- Mouse events (mousedown, mousemove, mouseup) are captured on the overlay div, not the iframe
- Draw a visible selection rectangle (dashed border) as the user drags
- Coordinates captured are relative to the overlay/iframe top-left — translate these before sending to the iframe
- Only render the overlay when `generatedHtml` is non-empty (disabled on baseline iframe)
- Overlay must not interfere with the desktop/mobile toggle buttons above the preview

**Files to modify:**
- `components/PreviewPane.tsx`
