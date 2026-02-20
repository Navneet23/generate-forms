# Forms AI Restyler — V4 Requirements

## Overview

V4 upgrades the template system from a reference-image-only mechanism to a style definition approach. Rather than asking the AI to re-interpret reference images on every generation, templates are stored with explicit style definitions that are applied directly. This makes template output more reliable, more consistent across models, and cheaper to run.

---

## Feature: Templates with Style Definitions

### The Problem with V3 Templates

In V3, selecting a template sends reference images to the AI and asks it to visually interpret the style. This has two structural weaknesses:

- **Inconsistency**: Two generations from the same template can produce visibly different results because the AI interprets the images differently each time
- **Cost**: Reference images are sent on every AI call for the entire session, making template sessions significantly more expensive than plain prompt sessions

### The V4 Approach

Templates are stored with an explicit style definition alongside their reference images. When a creator selects a template, the style definition is passed to the AI as structured context — not just images to interpret.

**Updated template asset structure:**

| Asset | Purpose |
|---|---|
| `thumbnail.jpg` | Small preview shown in gallery grid (unchanged) |
| `reference_1.jpg … reference_N.jpg` | Shown in the expanded template view for creator preview (unchanged) |
| `style.json` | Explicit style definition passed to AI as structured context |
| `metadata.json` | Name, description, category (unchanged) |

**Example `style.json`:**
```json
{
  "name": "Corporate Clean",
  "layout": "single-column",
  "colors": {
    "background": "#ffffff",
    "surface": "#f8f9fa",
    "primary": "#1a73e8",
    "text": "#202124",
    "border": "#dadce0"
  },
  "typography": {
    "fontFamily": "Google Sans, sans-serif",
    "questionSize": "16px",
    "labelSize": "14px",
    "weight": "400"
  },
  "spacing": "comfortable",
  "borderRadius": "8px",
  "shadow": "subtle",
  "questionCard": {
    "style": "bordered",
    "padding": "24px"
  }
}
```

---

### How It Changes the Generation Flow

**V3 flow:**
```
Template selected
→ Fetch reference images
→ Send images to AI on every call
→ AI re-interprets visually each time
→ Variable output
```

**V4 flow:**
```
Template selected
→ Fetch style.json
→ Pass structured style definition to AI on every call
→ AI applies known style values directly
→ Consistent, cheaper output
```

Reference images are no longer sent to the AI during generation. They exist only to help the creator choose a template in the gallery. This removes the per-session image token cost entirely for template selections.

---

### Benefits Over V3

| | V3 (reference images) | V4 (style definitions) |
|---|---|---|
| Output consistency | Variable — AI re-interprets each time | High — style values are explicit |
| Token cost per generation | High — images sent every call | Low — structured JSON only |
| Works across all models | Yes, but quality varies | Yes, more uniformly |
| Template creation effort | Design + screenshot | Design + screenshot + author style.json |
| Flexibility for AI to adapt | High | Medium — AI works within defined constraints |

---

### Tradeoff: Less AI Creative Latitude

With style definitions, the AI is working within tighter constraints. This is the right tradeoff for templates (consistency is the goal) but means the AI has less room to be creative with how it interprets the style. Creators who want more variation should still use plain prompts or the style guide feature rather than templates.

---

### Template Authoring Process (Internal)

For each template, the team must produce:
1. Reference images (already required in V3 — no change)
2. A `style.json` that accurately encodes the visual design decisions shown in those images

`style.json` authoring should happen alongside template design, not after — it is the source of truth, and the reference images should be generated to match it.

---

## Known Limitations (Accepted for V4)

| Limitation | Reason accepted |
|---|---|
| Style definitions authored manually per template | Automation of style extraction from images deferred to future version |
| Style definition schema may not capture every design nuance | AI prompt supplements the schema with reference image descriptions for edge cases |
| User-generated templates still not supported | User-authored style definitions adds significant complexity; deferred |
