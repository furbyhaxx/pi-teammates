# Task Board and Batch Workflow Design Capture

**Status:** initial design capture

## Implementation status

- Status: draft
- Target milestone: later
- Owner surface: command, tool, UI, internal mechanic, tests

## Finalized scope

Not finalized for implementation yet. This remains a roadmap design until core delegation and context-state mechanics are sharper.

## Deferred scope

- **[tbb-1] `team_task_*` tools**
  - Reason: too large for the first implementation pass and requires stable task persistence semantics.
  - Depends on: deciding session-local vs project-persisted task state and structured result envelopes.
  - Revisit when: delegation v1 is implemented and a task-board-specific implementation plan is requested.
  - Candidate surface: tool, internal mechanic, tests.
- **[tbb-2] `/team:tasks` overlay**
  - Reason: waiting for task model and UI scope validation.
  - Depends on: `team_task_*` or equivalent read model.
  - Revisit when: task state exists and needs human inspection/editing.
  - Candidate surface: command, UI.
- **[tbb-3] `/team:batch` guided workflow**
  - Reason: depends on delegation-orchestration v1 and possibly task/goal state.
  - Depends on: deciding whether initial batch is prompt-only or task-board-backed.
  - Revisit when: delegation v1 is verified and the user selects batch workflows as next implementation.
  - Candidate surface: command, internal mechanic.

## What we are designing

A future task-board and batch-orchestration layer for pi-teammates that can coordinate multi-step, multi-teammate efforts without confusing user commands with agent-callable tools.

## Data and sources

- Local pi-teammates:
  - `delegate` already supports parallel `tasks` and sequential `chain` calls.
  - `/team:status` displays persisted job records.
  - Custom session entries already persist teammate job/state data.
- Claude Code extracted prompts:
  - `system-prompts/tool-description-taskcreate.md`: tasks start as `pending` and use active-form wording.
  - `system-prompts/tool-description-todowrite.md`: lifecycle `pending`, `in_progress`, `completed`; exactly one local in-progress task.
  - `system-prompts/system-prompt-tool-usage-task-management.md`: mark tasks complete immediately, do not batch completions.
  - `system-prompts/tool-description-teammatetool.md`: team creation, shared task list, assigning owners, idle teammates, graceful shutdown.
  - `system-prompts/system-prompt-coordinator-mode-orchestration.md`: research, synthesis, implementation, verification phases.

## Candidate task model

A pi-teammates task-board item could contain:

```ts
interface TeamTask {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "blocked" | "completed" | "failed";
  phase?: "research" | "synthesis" | "implementation" | "verification" | "review";
  owner?: string;
  dependsOn?: string[];
  createdAt: string;
  updatedAt: string;
  evidence?: string[];
  resultSummary?: string;
  blocker?: string;
}
```

Persist through custom session entries, following existing `job-registry.ts` patterns.

## User command candidates

These are human-invoked workflows:

- `/team:tasks` — open task-board overlay.
- `/team:goal [goal]` — set high-level goal and optionally seed tasks.
- `/team:batch [goal]` — guided flow for decomposing a larger goal into tasks and delegate calls.

## Agent tool candidates

These are model-invoked operations:

- `team_task_create`
- `team_task_update`
- `team_task_list`
- `team_goal_set`
- `team_goal_get`

Tools should have stable structured results and recoverable validation errors.

## Batch workflow sketch

`/team:batch [goal]` should not itself be a magical autonomous swarm. Initial version can be a guided coordinator prompt/workflow:

1. Capture goal and constraints.
2. Ask the parent agent to decompose into research/synthesis/implementation/verification tasks.
3. Encourage parallel `delegate({ tasks: [...] })` for independent research.
4. Require parent synthesis before implementation delegation.
5. Require independent verification before final user-facing completion claims.

## Constraints

- Do not create a heavy scheduler before simple persisted task state proves useful.
- Keep parent agent responsible for synthesis and final answer.
- Preserve one-level delegation by default.
- Treat idle/running teammate state as normal, not an error.

## Open decisions

1. Should task-board tools be shipped before `/team:batch`, or should `/team:batch` initially work without a task board?
2. Should tasks be session-local only, or optionally project-persisted in `.pi/`?
3. Should `delegate` automatically create/update task-board items, or should task tools be explicit?
4. Should `/team:tasks` allow editing tasks in the TUI, or start as read-only status?
