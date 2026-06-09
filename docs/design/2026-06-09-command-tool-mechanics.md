# Command, Tool, and Internal Mechanic Boundaries

**Status:** initial design capture

## Implementation status

- Status: draft
- Target milestone: next
- Owner surface: command, tool, internal mechanic

## Finalized scope

Not finalized for implementation yet. The boundary rule itself is accepted as the organizing convention for future designs: human-invoked behavior belongs in `/team:*` commands, model-invoked behavior belongs in tools, and prompt/state/reminder behavior remains internal unless explicitly surfaced.

## Deferred scope

- **[ctm-1] New `team_*` tool family**
  - Reason: too large for the first delegation-orchestration implementation pass.
  - Depends on: concrete task-board, goal-state, or follow-up requirements.
  - Revisit when: `delegation-orchestration` v1 is implemented and a specific tool need is selected.
  - Candidate surface: tool.
- **[ctm-2] New `/team:*` workflow commands**
  - Reason: waiting for UX validation and clearer internal state models.
  - Depends on: goal/task/activity designs being finalized.
  - Revisit when: a command has an implementation plan with explicit state ownership.
  - Candidate surface: command, UI.

## What we are designing

A clear boundary model for pi-teammates features so user-invoked commands are not confused with agent-callable capabilities.

## Data and sources

- Local pi-teammates extension surfaces:
  - `src/index.ts` registers user commands such as `/team:delegate`, `/team:handoff`, `/team:status`, `/team:manage`, `/team:eject`.
  - `src/index.ts` registers the agent-callable `delegate` tool.
  - `src/delegation-policy.ts` injects model-facing delegation policy into the system prompt.
- Pi extension guidance from the loaded `extending-pi-agent` skill:
  - `pi.registerCommand(...)` is for user slash commands.
  - `pi.registerTool(...)` is for model-invoked tools.
  - Runtime behavior can also be added through events such as `before_agent_start`, `input`, `tool_call`, and `tool_result`.
- Claude Code extracted prompt repository:
  - `system-prompts/tool-description-agent-usage-notes.md` distinguishes spawning agents, background execution, and continuation.
  - `system-prompts/tool-description-sendmessagetool.md` describes agent-to-agent messaging as a tool, not a user command.
  - `system-prompts/tool-description-teammatetool.md` describes team creation/task coordination as tool-mediated team mechanics.

## Boundary model

### User commands

User commands are typed by the human. They should open UI, start explicit workflows, or mutate local configuration after user intent is clear.

Current examples:

- `/team:delegate`
- `/team:handoff`
- `/team:status`
- `/team:manage`
- `/team:eject`

Candidate future user commands:

- `/team:goal [goal]` — create or update a human-approved team goal in session state.
- `/team:batch [goal]` — start a guided coordinator workflow for a larger task.
- `/team:tasks` — inspect or edit the team task board.
- `/team:review` — request a structured review of teammate outputs and current diffs.

### Agent-callable tools

Agent tools are called by the LLM during normal work. They must be described as model-facing APIs, not slash commands.

Current tool:

- `delegate` — spawn/resume isolated teammate sessions.

Candidate future tools:

- `team_goal_set` — set/update a structured session goal after the parent has understood the task.
- `team_task_create` — create a task-board item.
- `team_task_update` — claim, block, complete, or annotate a task-board item.
- `team_task_list` — read the current task board.
- `team_message` — send a follow-up to a named running/completed teammate session if named-message semantics are added.

Tool naming should favor stable snake_case for new tool families while preserving the existing standalone `delegate` tool.

### Internal mechanics

Internal mechanics are not directly invoked by user or model. They steer behavior and preserve state.

Current examples:

- `before_agent_start` dynamic `<delegation_policy>` and `<team>` prompt injection.
- Custom session entries for teammate jobs and lineage.
- Context generation for `summary` and `handoff` modes.
- `/team:status` and `/team:manage` overlays.

Candidate future mechanics:

- Runtime reminders after delegate completion: verify teammate reports before telling the user work is complete.
- Authority-boundary reminders: teammate output is evidence, not user approval.
- Structured completion-state parsing: completed / needs_input / failed.
- Compaction-aware reinjection of goal/task state.

## Design rule

If the human types it, it is a `/team:*` command. If the agent invokes it, it is a tool. If it only changes prompt/state/UI behavior around those surfaces, it is an internal mechanic.

## Open decisions

1. Should future team tools be one broad `team_state` tool with actions, or separate narrow tools (`team_task_create`, `team_task_update`, etc.)?
2. Should `/team:goal` create only human-visible state, or also inject model-facing reminders automatically?
3. Should agent-callable named follow-up be added to `delegate` via `resumeSessionId`, or should it be a separate `team_message` tool?
