# pi-teammates Design Notes

This directory contains initial and evolving design captures for Claude Code-inspired `pi-teammates` improvements.

## Design document convention

Each design document should keep these sections explicit:

```md
## Implementation status

- Status: draft | finalized | implementing | implemented | superseded
- Target milestone: now | next | later | maybe
- Owner surface: command | tool | internal mechanic | UI | docs | tests

## Finalized scope

Items approved for the next implementation pass.

## Deferred scope

Items intentionally not included in the next implementation pass.

Use this shape for each deferred item:

- **[deferred-id] Title**
  - Reason: ...
  - Depends on: ...
  - Revisit when: ...
  - Candidate surface: command | tool | internal mechanic | UI | docs | tests

## Open decisions

Questions that block finalization.
```

## Deferral rules

- Every deferral must say **why** it is deferred.
- Every deferral must state whether it is dependency-blocked, too large, risky, lower priority, or waiting for UX validation.
- Deferred implementation work must remain in either the source design doc's `Deferred scope` or this index's roadmap table.
- Avoid vague “future maybe” bullets. Include a concrete revisit trigger.
- Preserve command/tool/internal boundaries:
  - `/team:*` = human-invoked commands.
  - `delegate` and future `team_*` names = agent-callable tools.
  - prompt/state/reminder behavior = internal mechanics unless surfaced as a command or tool.

## Design index

| Design | Status | Target | Owner surface | Notes |
| --- | --- | --- | --- | --- |
| [`2026-06-09-delegation-orchestration.md`](2026-06-09-delegation-orchestration.md) | draft | now | tool, internal mechanic, docs, tests | Recommended first to finalize and implement. |
| [`2026-06-09-context-steering-and-state.md`](2026-06-09-context-steering-and-state.md) | draft | next | internal mechanic, tool | Depends partly on delegation-orchestration decisions. |
| [`2026-06-09-command-tool-mechanics.md`](2026-06-09-command-tool-mechanics.md) | draft | next | command, tool, internal mechanic | Boundary rules apply to all future work. |
| [`2026-06-09-delegate-tui-polish.md`](2026-06-09-delegate-tui-polish.md) | draft | next | UI, tests | Collapsed renderer polish; keep schema/result details stable. |
| [`2026-06-09-teammate-recruiting-and-profiles.md`](2026-06-09-teammate-recruiting-and-profiles.md) | draft | next | skill, command, docs | Good follow-up after delegation prompt policy stabilizes. |
| [`2026-06-09-teammate-activity-timeline.md`](2026-06-09-teammate-activity-timeline.md) | draft | later | UI, internal mechanic | Depends on structured completion and/or job-state shape. |
| [`2026-06-09-task-board-and-batch-workflows.md`](2026-06-09-task-board-and-batch-workflows.md) | draft | later | command, tool, UI, internal mechanic | Larger roadmap item; defer until core delegation is sharper. |
| [`2026-06-09-display-state-bug.md`](2026-06-09-display-state-bug.md) | implemented | now | UI, tests | Regression captured in `tests/delegate-rendering.test.ts`. |

## Current implementation recommendation

Finalize and implement [`2026-06-09-delegation-orchestration.md`](2026-06-09-delegation-orchestration.md) first with a small v1 scope:

1. delegation brief quality contract,
2. spawn-vs-resume guidance,
3. trust-but-verify reminder,
4. one-level delegation policy wording.

Keep these items deferred until after that v1 lands:

- optional `phase` schema field,
- named follow-up / `team_message`,
- task board tools,
- `/team:batch`,
- teammate activity timeline UI,
- structured completion parser/classifier.
