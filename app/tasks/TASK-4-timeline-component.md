# TASK-4: Build Timeline UI component

## Phase
Phase 2 — Frontend

## Priority
P0

## Description
Create a new `TimelineMessage` React component that renders a vertical list of generation steps with status indicators (spinner, checkmark, error icon), step text, optional detail text, and elapsed time. Support both "live" mode (during generation, receiving new steps) and "static" mode (after generation, displaying completed steps). Include collapse/expand toggle that switches between the full timeline and a single-line summary.

## Requirements
- Vertical timeline with status indicators per step
- Three states per step: in-progress (spinner), completed (checkmark), failed (error icon)
- Elapsed time display per completed step
- Collapse/expand toggle
- Collapsed summary format: "Form generated in N steps (Xs)"

## Acceptance Criteria
- [ ] `TimelineMessage` component in `components/TimelineMessage.tsx`
- [ ] Accepts props: `steps: TimelineStep[]`, `totalDuration: number`, `collapsed: boolean`, `onToggleCollapse: () => void`, `isLive: boolean`
- [ ] `TimelineStep` type: `{ step: string, label: string, status: 'started' | 'completed' | 'failed', detail?: string, startedAt: number, completedAt?: number }`
- [ ] In-progress steps show an amber animated spinner (CSS animation, no external deps)
- [ ] Completed steps show a green checkmark icon
- [ ] Failed steps show a red X icon with error message
- [ ] Elapsed time (e.g., "2.3s") displayed right-aligned for completed steps
- [ ] Long detail text (plan summary, image prompts) truncates with "..." and expands on click
- [ ] Collapsed view shows single-line summary with "Expand" link
- [ ] Expanded view shows full timeline with "Collapse" link at bottom-right
- [ ] Styling matches spec: text-sm, gray-700 text, gray-400 timestamps, text-xs collapse link
- [ ] Component fits within the `w-80 xl:w-96` chat panel width

## Technical Notes
- This is a new file: `components/TimelineMessage.tsx`.
- Use Tailwind classes consistent with existing chat message styling in `ChatPanel.tsx` (lines 242-266).
- The background should be `bg-gray-100` to match assistant messages.
- For the spinner, use Tailwind's `animate-spin` on an SVG circle or use a CSS keyframe animation.
- The checkmark and X icons can be simple SVG inline icons (no icon library needed — the codebase already uses inline SVGs, see `ChatPanel.tsx` line 349).
- Detail text truncation: use `line-clamp-1` with a click handler to toggle full display.

## Dependencies
None (can be built in parallel with backend tasks)

## Estimated Effort
Medium (1-2 days)
