# Forms AI Restyler — V3 Requirements

## Overview

V3 adds two features. A model picker gives creators control over which AI model generates their form, with options across Claude and Gemini. A template gallery solves the cold start problem — creators who have no specific visual direction can pick from a curated set of templates to get to a good result quickly.

---

## New Features in V3

### 1. Model Picker

A model selector in the chat input bar. Selection persists for the entire session.

**Models offered:**

| Provider | Model | Characteristic |
|---|---|---|
| Anthropic | Claude Opus 4.6 | Highest quality, slower |
| Anthropic | Claude Sonnet 4.6 | Balanced quality and speed |
| Anthropic | Claude Haiku 4.5 | Fastest, lighter output |
| Google | Gemini 2.0 Flash | Fast, multimodal |
| Google | Gemini 1.5 Pro | High quality, large context |

**UI placement:**

```
┌───────────────────────────────────────────────────────┐
│ [Model: Claude Sonnet ▾]      [+]  [Style guide]      │
│ [Type a prompt...]                               [→]  │
└───────────────────────────────────────────────────────┘
```

Clicking the model selector opens a dropdown. Each model shows a one-line description of its tradeoff so creators can make an informed choice without needing to know the models in depth.

---

**Technical challenges:**

**1. Two separate API clients and auth systems**

Claude and Gemini use different SDKs, base URLs, authentication methods, and error formats. Need a provider abstraction layer in the backend so prompt construction and response handling are not duplicated per provider:

```
Prompt layer (shared)
        ↓
AI Provider Abstraction
   ├── Anthropic SDK  →  Claude API
   └── Google SDK     →  Gemini API
```

**2. Vision input format differs per provider**

Template reference images, style guide images, and screenshot captures all need to be reformatted depending on the selected model. The abstraction layer must handle this transparently so the rest of the system does not need to know which provider is active.

**3. Prompt tuning is model-specific**

A system prompt optimised for Claude may produce weaker results on Gemini. Maintain a per-provider system prompt variant rather than a single shared one. This is ongoing quality work, not a one-time task.

**4. Context window and image limits vary per model**

Larger models handle more images and longer conversation history. Haiku and Flash have tighter limits. When a smaller/faster model is selected, the system may need to reduce the number of template reference images sent or truncate older conversation history. This degradation should be surfaced to the creator, not silent.

**5. Cost is now variable and provider-dependent**

Token pricing differs across models and providers. Track token usage per provider separately. If usage quotas or billing are in scope, model choice directly affects cost per generation.

---

### 2. Template Gallery

Solves the cold start problem for creators who want a great-looking form but have no specific visual direction. A curated set of templates — each with multiple reference images — gives creators a starting point they can then refine via chat.

**Entry point:**
- A **"Browse templates"** button visible before the creator's first prompt, below the preview pane
- Also accessible from the chat panel at any point in the session
- Gallery button is disabled until the form URL has been successfully scraped — template generation requires the form structure to already be loaded

**Template gallery dialog:**

```
┌──────────────────────────────────────────────────────────┐
│  Choose a template                                       │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐│
│  │[preview] │  │[preview] │  │[preview] │  │[preview] ││
│  │Corporate │  │Playful   │  │Dark      │  │Soft      ││
│  │Clean     │  │Survey    │  │Minimal   │  │Pastel    ││
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘│
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │[preview] │  │[preview] │  │[preview] │              │
│  │Bold      │  │Editorial │  │Minimal   │              │
│  │Gradient  │  │Magazine  │  │One-Pager │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│                                                  [Close] │
└──────────────────────────────────────────────────────────┘

Clicking a template card:
┌──────────────────────────────────────────────────────────┐
│  ← Back      Corporate Clean                             │
│                                                          │
│  [Large preview]  [img 2]  [img 3]  [img 4]             │
│                                                          │
│  Clean, professional layout. Works well for HR           │
│  surveys, feedback forms, and internal tooling.          │
│                                                          │
│                         [Use this template]              │
└──────────────────────────────────────────────────────────┘
```

---

**How templates work:**

Each template is a curated asset package stored on CDN:

| Asset | Purpose |
|---|---|
| `thumbnail.jpg` | Small preview shown in the gallery grid |
| `reference_1.jpg … reference_N.jpg` | Full reference images sent to AI as vision context (max 5) |
| `metadata.json` | Name, description, number of reference images |

When a creator selects a template:
1. All reference images for that template are fetched from CDN
2. A generation is triggered immediately with a default prompt: `"Style this form to match the visual design shown in the reference images"`
3. Reference images are sent to the AI as vision inputs alongside the form structure
4. Generated form appears in the preview pane
5. Creator refines further via chat as normal

The selected template's reference images **persist for the entire session** — re-attached on every subsequent AI call, similar to how the style guide works in V2.

---

**Technical challenges:**

**1. Token cost — multiple images sent on every generation**

Sending 3–5 reference images on every AI call for the full session is the highest per-generation cost driver in the product. Mitigations:
- Cap reference images per template at 5
- Compress and resize images before sending (AI does not need full resolution to extract style — target under 200KB each)
- On smaller/faster models (Haiku, Flash), automatically reduce to 2 reference images and surface a notice to the creator

**2. Context window pressure accumulates over a long session**

Conversation history + template images + style guide + screenshot captures compounds quickly. Strategy:
- Template images: always keep — they are the style foundation
- Style guide: always keep if set
- Conversation history: keep last N turns, drop older ones
- Screenshot captures: keep only the most recent

**3. Template and style guide conflict**

If a creator picks a template and also provides a style guide (V2 feature), both are sent as visual context. Define precedence clearly in the AI prompt: style guide takes priority over template. Surface this in the UI with a note: `"Your style guide will take priority over the template."`

**4. Template reference images must be created manually**

For V3, templates are team-curated — no user-generated templates. Someone has to produce the reference images. Two viable approaches:
- Design templates in Figma and screenshot them
- Use the AI to generate styled forms, approve the good ones, and screenshot those as references

Either way this is ongoing work. Define an internal process before committing to a launch library size. Target: 8–12 templates at launch, quality over quantity.

**5. Template reference images must not be deleted while active sessions exist**

Use versioned CDN URLs so updating or retiring a template does not break ongoing sessions that have already loaded its images.

---

## Interaction Between V3 Features

| Scenario | Behaviour |
|---|---|
| Template selected, then model changed | Re-generate with new model using same template images and conversation history |
| Template selected, then style guide applied | Both sent as context; style guide takes precedence; notice shown to creator |
| Smaller model selected with a 5-image template | Auto-reduce to 2 images; surface notice: `"Using 2 reference images for this model"` |
| Template selected mid-session | New template images replace previous template images in context; prior conversation history retained |
| Gallery opened before form is loaded | Gallery button disabled; tooltip: `"Load a form first"` |

---

## Known Limitations (Accepted for V3)

| Limitation | Reason accepted |
|---|---|
| Templates are team-curated only, no user-generated templates | Deferred to future version |
| Template mechanism is reference images only, not style definitions | More robust style definition approach deferred to V4 |
| Model picker does not show cost or speed estimates per model | Adds UI complexity; descriptions serve as a proxy |
| Smaller models may degrade with many images | Creator informed via model description and in-session notice |
| No per-section template application | Full-form templates only |
