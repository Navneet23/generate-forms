# Task V2-07 — Style Guide Dialog

## Status
`To Do`

## Description

Add a **"Style guide"** button to the chat input bar that opens a modal dialog. The dialog lets the creator provide a visual style reference to the AI — either by uploading an image or providing a website URL. The style guide is used as a reference only and is never embedded in the form.

**Dialog UI:**
```
┌────────────────────────────────────────┐
│  Provide a style guide            [×]  │
│                                        │
│  ● Upload an image                     │
│    [Drop image here or browse]         │
│                                        │
│  ○ Use a website                       │
│    [https://...]         [Preview]     │
│                                        │
│  Anything specific to focus on?        │
│  [e.g. "color palette and typography"] │
│                                        │
│                  [Apply]   [Cancel]    │
└────────────────────────────────────────┘
```

**Behaviour:**

- Two radio options: "Upload an image" and "Use a website" — only one active at a time
- **Upload an image:** file picker opens on click; shows a preview thumbnail once selected; image is read as base64 in the browser (not uploaded to server — ephemeral)
- **Use a website:** text input for URL + "Preview" button; Preview triggers Task V2-08 to screenshot the site and shows the result as a thumbnail in the dialog
- **"Anything specific to focus on?"** optional text field — passed along to the AI with the style guide
- **Apply:** saves the style guide to session state (image base64 or website screenshot base64 + focusNote); closes dialog; shows a "Style guide applied" indicator near the button
- **Cancel:** discards changes; closes dialog
- If a style guide is already set, opening the dialog shows the current one pre-filled and allows replacing it

**Style guide indicator (in chat toolbar):**
- When a style guide is active: button shows a filled/highlighted state e.g. "Style guide ✓"
- Clicking it again opens the dialog to replace or clear it

**Files to create:**
- `components/StyleGuideDialog.tsx`

**Files to modify:**
- `components/ChatPanel.tsx` (add Style guide button, wire dialog, pass style guide state)
- `app/page.tsx` (lift style guide state up so it persists across chat turns)

**Dependencies:**
- Task V2-08 (website screenshot API, needed for the "Use a website" option)
- Task V2-04 (multimodal generate API must accept style guide)
