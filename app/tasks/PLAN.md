# Implementation Plan: Generation Progress Timeline

## Overview

This plan covers the implementation of real-time progress timeline for AI form generation, replacing the static "Generating..." spinner with a live vertical timeline of steps streamed via Server-Sent Events (SSE). The feature spans backend (SSE streaming, new Gemini function call) and frontend (timeline UI, SSE parsing, message type expansion).

**Total tasks: 11** (5 completed, 6 remaining)
**Estimated total effort: 12-17 days**
**Phases: 4**

---

## Phases Table

| Phase | Name | Tasks | Estimated Duration | Description |
|-------|------|-------|--------------------|-------------|
| 1 | Backend Foundation | TASK-1, TASK-2, TASK-3 | 3-5 days | Add `announce_plan` function, progress callbacks, and SSE endpoint |
| 2 | Frontend | TASK-4, TASK-5, TASK-6 | 4-6 days | Build timeline component, SSE client, and message type expansion |
| 3 | Robustness | TASK-7, TASK-8, TASK-9 | 2-4 days | Error handling, multi-image numbering, plan fallback |
| 4 | Quality Assurance | TASK-10, TASK-11 | 3-4 days | Testing and documentation |

---

## Dependency Graph

```
TASK-1 (announce_plan declaration)
  |
  v
TASK-2 (onProgress callback)------+
  |                                |
  v                                v
TASK-3 (SSE endpoint)         TASK-9 (plan fallback)
  |                                
  v                                
TASK-5 (SSE client) <--- TASK-4 (timeline component)
  |                        |
  v                        v
TASK-7 (error handling)  TASK-6 (message type expansion)
                           |
                           v
                         TASK-8 (multi-image numbering)
                              
TASK-10 (testing) <--- TASK-3, TASK-4, TASK-5
TASK-11 (documentation) <--- TASK-1 through TASK-5
```

**Parallelization opportunities:**
- TASK-4 (timeline component) can be built in parallel with TASK-1, TASK-2, TASK-3 (all backend)
- TASK-6 (message types) can be done alongside TASK-5 (SSE client)
- TASK-8 (multi-image) and TASK-9 (plan fallback) can be done in parallel

---

## Critical Path

```
TASK-1 -> TASK-2 -> TASK-3 -> TASK-5 -> TASK-7
```

This is the longest dependency chain and determines the minimum timeline:
1. **TASK-1** (Small, <1d): `announce_plan` function declaration -- unblocks everything
2. **TASK-2** (Medium, 1-2d): `onProgress` callback in `generateForm` -- the core event emission
3. **TASK-3** (Medium, 1-2d): SSE endpoint conversion -- backend delivery mechanism
4. **TASK-5** (Large, 2-3d): SSE client in ChatPanel -- frontend consumption (also needs TASK-4)
5. **TASK-7** (Medium, 1-2d): Error handling -- robustness layer

**Critical path duration: 6-9 days** (with TASK-4 built in parallel during Phase 1)

---

## Risk Mitigation Mapping

| Risk | Severity | Mitigation | Related Tasks |
|------|----------|------------|---------------|
| Vercel serverless timeout on long SSE streams | High | Verify deployment tier supports streaming; test with multi-image generations; add timeout detection | TASK-3, TASK-7 |
| Gemini skips `announce_plan` | Medium | TASK-9 implements fallback; system prompt reinforcement in TASK-1 | TASK-1, TASK-9 |
| SSE connection drops mid-generation | Medium | TASK-7 implements detection and retry UI | TASK-7 |
| `announce_plan` adds latency to all generations | Low | Accept 1-2s cost; plan visibility provides value that justifies it | TASK-1 |
| Multiple function calls in single Gemini response (ordering) | Medium | Process `announce_plan` first regardless of part order in TASK-1 handler | TASK-1, TASK-2 |
| Chat panel width too narrow for timeline | Low | Truncate long text with expand-on-click in TASK-4 | TASK-4 |
| Debug logging interferes with SSE output | Low | Ensure logs go to console/file, not to response stream | TASK-3 |

---

## Task Index

| # | Task | Phase | Priority | Effort | Dependencies | Key Files |
|---|------|-------|----------|--------|--------------|-----------|
| 1 | Add `announce_plan` function declaration | Phase 1 | P0 | Small | None | `lib/gemini.ts` | **DONE** |
| 2 | Add `onProgress` callback to `generateForm` | Phase 1 | P0 | Medium | TASK-1 | `lib/gemini.ts` | **DONE** |
| 3 | Convert `/api/generate` to SSE endpoint | Phase 1 | P0 | Medium | TASK-2 | `app/api/generate/route.ts` | Pending |
| 4 | Build Timeline UI component | Phase 2 | P0 | Medium | None | `components/TimelineMessage.tsx` (new) | **DONE** |
| 5 | Replace fetch+JSON with SSE reader in ChatPanel | Phase 2 | P0 | Large | TASK-3, TASK-4 | `components/ChatPanel.tsx` | Pending |
| 6 | Expand message type system for timelines | Phase 2 | P0 | Small | TASK-4 | `components/ChatPanel.tsx` | Pending |
| 7 | Implement SSE error handling and recovery | Phase 3 | P1 | Medium | TASK-3, TASK-5 | `components/ChatPanel.tsx`, `app/api/generate/route.ts` | Pending |
| 8 | Handle multiple image steps with numbering | Phase 3 | P1 | Small | TASK-2, TASK-4 | `lib/gemini.ts`, `components/TimelineMessage.tsx` | **DONE** |
| 9 | Handle missing `announce_plan` gracefully | Phase 3 | P1 | Small | TASK-1, TASK-2 | `lib/gemini.ts` | **DONE** |
| 10 | Add tests for SSE and timeline logic | Phase 4 | P1 | Large | TASK-3, TASK-4, TASK-5 | New test files | Pending |
| 11 | Update architecture documentation | Phase 4 | P2 | Small | TASK-1-5 | Existing docs, inline comments | Pending |

---

## Subagent Execution Strategy

### Why subagents

Each subagent gets a focused task with clear boundaries, relevant file context, and acceptance criteria. This allows parallel execution where the dependency graph permits, and keeps each agent's context window small and focused.

### Agent grouping

Not every task maps 1:1 to a subagent. Some tasks are too small or tightly coupled to justify isolation. The grouping below optimizes for **parallel execution**, **minimal cross-agent conflicts**, and **clean file ownership** (no two agents editing the same file simultaneously).

| Agent | Tasks | Runs in | Rationale |
|-------|-------|---------|-----------|
| **Agent A: Backend — Gemini function calling** | TASK-1 + TASK-2 + TASK-9 | Worktree | All modify `lib/gemini.ts`. TASK-1 is small and TASK-9 is a direct follow-on. Grouping avoids merge conflicts. |
| **Agent B: Backend — SSE endpoint** | TASK-3 | Worktree | Modifies `app/api/generate/route.ts` only. Depends on Agent A's output but touches different files. |
| **Agent C: Frontend — Timeline component** | TASK-4 + TASK-8 | Worktree | Creates `components/TimelineMessage.tsx` (new file). TASK-8 (multi-image numbering) is a small extension to the same component. No conflicts with other agents — new file. |
| **Agent D: Frontend — SSE integration** | TASK-5 + TASK-6 | Worktree | Modifies `components/ChatPanel.tsx` and `app/page.tsx`. Depends on Agents B and C. |
| **Agent E: Robustness — Error handling** | TASK-7 | Worktree | Touches both `ChatPanel.tsx` and `route.ts`. Depends on Agents B and D. Must run after them. |
| **Agent F: QA — Tests** | TASK-10 | Worktree | Creates new test files. Depends on all prior agents. |
| **Agent G: Documentation** | TASK-11 | Worktree | Updates `documentation/architecture.md` and `requirements/`. Depends on all prior agents. |

### Execution order and parallelism

```
Wave 1 (parallel):                       ✅ COMPLETED (commit 41b10fe)
  ├── Agent A: TASK-1 + TASK-2 + TASK-9  (lib/gemini.ts)
  └── Agent C: TASK-4 + TASK-8           (components/TimelineMessage.tsx — new file)

Wave 2 (after Agent A completes):        ⬅ NEXT
  └── Agent B: TASK-3                    (app/api/generate/route.ts)

Wave 3 (after Agents B and C complete):
  └── Agent D: TASK-5 + TASK-6           (components/ChatPanel.tsx, app/page.tsx)

Wave 4 (after Agent D completes):
  └── Agent E: TASK-7                    (ChatPanel.tsx, route.ts)

Wave 5 (after Agent E completes, parallel):
  ├── Agent F: TASK-10                   (new test files)
  └── Agent G: TASK-11                   (documentation)
```

### Agent prompt template

Each agent should be invoked with `isolation: "worktree"` and given:

1. **Context**: The task file path(s) to read (e.g., `tasks/TASK-1-announce-plan-function-declaration.md`)
2. **Requirements**: Path to `requirements/generation_progress_timeline.md`
3. **Codebase orientation**: List of key files to read before starting
4. **Predecessor output**: If the agent depends on a prior agent, describe what changed (files modified, new types/interfaces added) so it doesn't work against stale assumptions
5. **Merge instruction**: After completing, the worktree branch should be merged back to the working branch

### Agent invocation example

```
Agent A prompt:
  "You are implementing a feature. Read tasks:
   - /app/tasks/TASK-1-announce-plan-function-declaration.md
   - /app/tasks/TASK-2-progress-callback-gemini.md
   - /app/tasks/TASK-9-plan-fallback.md
   Read requirements: /requirements/generation_progress_timeline.md
   Read before starting: /app/lib/gemini.ts, /app/lib/image-gen.ts
   Implement all three tasks. Run type-check (npx tsc --noEmit) before finishing."
```

### File ownership per agent (conflict avoidance)

| File | Owner Agent | Other agents must NOT edit |
|------|-------------|---------------------------|
| `lib/gemini.ts` | Agent A | Agents B-G read only |
| `app/api/generate/route.ts` | Agent B | Agents A, C-G read only |
| `components/TimelineMessage.tsx` (new) | Agent C | Agent D imports it, does not modify |
| `components/ChatPanel.tsx` | Agent D (then Agent E) | Sequential ownership — E runs after D |
| `app/page.tsx` | Agent D | Agent E reads only |
| Test files (new) | Agent F | No conflicts — new files |
| Documentation files | Agent G | No conflicts — separate from code |

### Merge strategy

After each wave, merge the worktree branches into the working branch before starting the next wave. Run `npx tsc --noEmit` after each merge to verify no type errors from integration. If conflicts arise, resolve them before spawning the next wave's agents.
