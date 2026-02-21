# Task V2-03 — Chat Image Attachment UI

## Status
`Done`

## Description

Update the chat panel to support attaching images to a message before sending. Images can come from two sources: screenshot capture (Task V2-01/02) and the + button image upload (Task V2-05). Both result in the same UI state — a thumbnail shown above the text input, cleared after the message is sent.

**Behaviour:**
- When an image is attached (from either source), a thumbnail preview appears above the chat input
- An "×" button on the thumbnail lets the creator remove it before sending
- The text input and Send button behave the same as before
- On send, the attached image is included in the generate request alongside the text prompt
- After sending, the thumbnail is cleared from the input area
- Multiple images cannot be attached simultaneously — one at a time only

**Attachment state:**
```
attachedImage: {
  base64: string,       // base64 PNG data
  source: "screenshot" | "upload",
  previewUrl: string    // object URL or data URL for thumbnail display
} | null
```

**UI layout (chat input area):**
```
┌─────────────────────────────────────────┐
│ [thumbnail 60×60] ×                     │  ← shown when image attached
├─────────────────────────────────────────┤
│ [+] [Style guide]                       │
│ [Type a prompt...]              [Send]  │
└─────────────────────────────────────────┘
```

**Files to modify:**
- `components/ChatPanel.tsx`

**Dependencies:**
- Task V2-04 (generate API must accept images before this is fully wired up)
