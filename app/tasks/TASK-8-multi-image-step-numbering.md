# TASK-8: Handle multiple image generation steps with numbering

## Phase
Phase 3 — Robustness

## Priority
P1

## Description
When Gemini requests multiple images (e.g., a header and a background), the timeline should show numbered image steps: "Generating image 1: {prompt}", "Generating image 2: {prompt}", etc. Each image gets its own pair of steps (generate + color match). Implement the numbering logic on both backend (emitting events with image index) and frontend (rendering numbered labels).

## Requirements
- Image steps numbered when multiple images are generated
- Each image gets generate + color_match step pair
- Backend emits image index in events
- Frontend renders numbered labels

## Acceptance Criteria
- [ ] When a single image is generated, label is "Generating image: {prompt}" (no number)
- [ ] When multiple images are generated, labels are "Generating image 1: {prompt}", "Generating image 2: {prompt}", etc.
- [ ] Each image's "Image ready, matching colors" step is associated with the correct image number
- [ ] If image 1 succeeds but image 2 fails, the timeline correctly shows success for 1 and failure for 2
- [ ] Image count is tracked in the `onProgress` callback in `lib/gemini.ts`
- [ ] The `ProgressEvent` type includes an optional `imageIndex` field

## Technical Notes
- In `lib/gemini.ts`, the image generation loop is at lines 287-349. Add an image counter variable before the `for` loop. Increment for each `generate_image` function call.
- The `ProgressEvent` type (from TASK-2) should include `imageIndex?: number` and `imageCount?: number`.
- On the frontend (`TimelineMessage.tsx`), use the imageIndex to generate the display label.
- Edge case: if Gemini requests images across multiple function-calling loop iterations (unlikely but possible), the counter should persist across iterations.

## Dependencies
TASK-2, TASK-4

## Estimated Effort
Small (< 1 day)
