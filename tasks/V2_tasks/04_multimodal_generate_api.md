# Task V2-04 — Multimodal Generate API (Images + Text)

## Status
`Done`

## Description

Update the AI generation layer to accept images alongside text prompts. Three types of images can now be sent to the AI in a single call: a screenshot capture (showing the region to edit), an embedded image URL context message, and a style guide image. All are optional and compose together.

**Updated request shape to `/api/generate`:**
```ts
{
  structure: FormStructure,
  prompt: string,
  history: HistoryTurn[],
  previousHtml: string,
  screenshotBase64?: string,     // from screenshot capture — ephemeral
  styleGuide?: {
    imageBase64?: string,        // from style guide upload — ephemeral
    focusNote?: string           // optional focus text
  }
}
```

**How images are sent to Gemini:**
- Gemini's `@google/generative-ai` SDK supports multimodal parts: `{ inlineData: { mimeType, data } }`
- The user message becomes an array of parts: text part + optional image parts
- Screenshot image is prepended with: "This is a screenshot of the region the creator wants to change:"
- Style guide image is prepended with: "Use the visual style of this image as reference. Focus on: {focusNote}"

**Style guide persistence:**
- The style guide (image + focusNote) is stored in session state in `page.tsx`
- On every subsequent generate call, the style guide is re-attached to the request — it must not be forgotten after the first call
- The creator can clear or replace the style guide via the Style Guide dialog

**Files to modify:**
- `app/api/generate/route.ts`
- `lib/gemini.ts`
- `app/page.tsx` (add styleGuide to session state, pass to ChatPanel)
- `components/ChatPanel.tsx` (pass screenshotBase64 and styleGuide in generate request)
