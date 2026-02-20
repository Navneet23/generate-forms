# Task 05 — Preview Pane

## Status
`To Do`

## Description

Build the preview pane UI component that displays the form to the creator. It starts by showing the original Google Form (Task 03) and switches to rendering AI-generated HTML after the first generation. Updates on every subsequent AI response.

**States:**

| State | What is shown |
|---|---|
| Form URL loaded, no generation yet | Original Google Form in a plain iframe (Task 03) |
| AI generation in progress | Loading indicator overlaid on current preview |
| AI generation complete | AI-generated HTML in a sandboxed iframe |
| Generation error | Error message in place of preview |

**Sandboxed iframe for AI-generated HTML:**
- Use the `sandbox` attribute to prevent the generated JS from accessing the parent page
- Required sandbox permissions: `allow-scripts allow-same-origin` (needed for form interaction and html2canvas in V2)
- The generated HTML is injected via `srcdoc` or served from your own origin at a temporary path — do not use a data URI (CSP issues)

**Desktop / mobile toggle:**
- Two buttons above the preview pane: `Desktop` and `Mobile`
- Desktop: preview pane renders at full width
- Mobile: preview pane constrained to 390px width, centred, with a visible device frame

**Implementation notes:**
- The switch from baseline iframe to AI-generated iframe should be seamless — replace the element in place, no layout shift
- Show a visible loading state during AI generation so the creator knows a response is coming
- The preview pane must not interfere with the parent page's scroll or input handling
