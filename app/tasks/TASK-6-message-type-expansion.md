# TASK-6: Expand message type system for timeline messages — COMPLETED

## Status
**COMPLETED** — Wave 3

## Phase
Phase 2 — Frontend

## Priority
P0

## Description
Refactor the `Message` type in `ChatPanel.tsx` and `page.tsx` to support the new `timeline` message type alongside existing text messages. Update the message rendering logic to dispatch to the appropriate component based on message type. Ensure timeline messages are excluded from the conversation history sent to Gemini (they are UI-only metadata). Add collapse/expand toggle state management per timeline message.

## Requirements
- Union type for Message supporting text and timeline variants
- Conditional rendering in message list
- Timeline messages excluded from Gemini history
- Per-message collapse state management

## Acceptance Criteria
- [ ] `Message` type is a discriminated union with `type?: "text" | "timeline"` (text messages default to "text")
- [ ] Message list rendering checks message type and renders `TimelineMessage` for timeline messages
- [ ] Clicking collapse/expand on a timeline message updates only that message's `collapsed` field
- [ ] Timeline messages are filtered out when building the `history` array passed to the API
- [ ] Existing text message rendering is unchanged
- [ ] TypeScript types are clean — no `any` casts needed

## Technical Notes
- The `Message` interface is at `ChatPanel.tsx` line 8. It needs to become a union type.
- The message rendering loop is at lines 241-266. Add a type check to render either the existing bubble or `TimelineMessage`.
- History update is at lines 175-179. Filter timeline messages when extracting conversation history.
- The `collapsed` field is per-message state. When the user clicks collapse/expand, update the specific message in the `messages` array using `setMessages` with a map function.
- Consider extracting the `Message` and `TimelineStep` types to a shared types file (e.g., `lib/types.ts`) since they'll be used by both `ChatPanel.tsx` and `TimelineMessage.tsx`.

## Dependencies
TASK-4

## Estimated Effort
Small (< 1 day)
