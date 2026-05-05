# TASK-11: Update architecture documentation for SSE and timeline

## Phase
Phase 4 — Quality Assurance

## Priority
P2

## Description
Update existing architecture documentation to reflect the new SSE streaming endpoint, the `announce_plan` function declaration, the `ProgressEvent` type, and the timeline UI component. Document the SSE event format, step definitions, and error handling behavior. This ensures future developers understand the streaming flow without reading all the code.

## Requirements
- Document SSE event format and all event types
- Document `announce_plan` function and its role
- Document timeline component props and behavior
- Update any existing architecture docs

## Acceptance Criteria
- [ ] SSE event format is documented with examples for each event type
- [ ] Step definitions table is included (matching the requirements spec)
- [ ] Error handling behavior is documented (step failures, fatal errors, connection drops)
- [ ] `announce_plan` function declaration and its purpose are documented
- [ ] `ProgressEvent` type definition is documented
- [ ] Timeline component usage and props are documented
- [ ] Any existing architecture docs (check `requirements/` or `docs/` directories) are updated

## Technical Notes
- Check for existing docs with `ls requirements/` — there's already `generation_progress_timeline.md` in requirements. Look for architecture docs referenced in commit `4009016` ("Update architecture docs for image generation").
- Keep documentation close to code — inline JSDoc comments on exported types and functions are preferred over separate doc files.
- The SSE event format documentation should live as a comment block near the SSE endpoint in `route.ts`.

## Dependencies
TASK-1, TASK-2, TASK-3, TASK-4, TASK-5

## Estimated Effort
Small (< 1 day)
