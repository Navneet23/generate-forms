# Task V2-09 — Style Guide Session Persistence

## Status
`To Do`

## Description

Ensure the style guide (image + optional focus note) is re-attached as context on every AI generation call for the duration of the session. Without this, the AI drifts away from the established style after a few chat iterations.

**State to persist in `page.tsx`:**
```ts
styleGuide: {
  imageBase64: string,   // base64 PNG — from image upload or website screenshot
  focusNote: string      // optional e.g. "focus on color palette"
} | null
```

**How persistence works:**
- Style guide is set in `page.tsx` state when the creator clicks Apply in the dialog
- `page.tsx` passes `styleGuide` to `ChatPanel` as a prop
- `ChatPanel` includes `styleGuide` in every `/api/generate` request — not just the first one after it was set
- The generate API passes it to `lib/gemini.ts` which includes it as an image part in every Gemini call
- Style guide is cleared only when: the creator explicitly removes it via the dialog, or the creator loads a new form URL (which resets all session state)

**UI indicator:**
- When `styleGuide` is non-null, the Style Guide button in the chat toolbar shows an active state (e.g. a checkmark or filled dot) so the creator knows it is applied
- Tooltip or label on hover: "Style guide active — click to change"

**Files to modify:**
- `app/page.tsx` (add styleGuide state, clear on new form load)
- `components/ChatPanel.tsx` (receive styleGuide prop, include in every generate request)

**Dependencies:**
- Task V2-04 (generate API must accept style guide)
- Task V2-07 (style guide dialog sets the state)
