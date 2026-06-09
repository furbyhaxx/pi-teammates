# Teammate Activity Timeline Design Capture

**Status:** initial design capture

## Implementation status

- Status: draft
- Target milestone: later
- Owner surface: UI, internal mechanic, tool, tests

## Finalized scope

Not finalized for implementation yet. This design should wait until structured completion state and job-registry shape decisions are clearer.

## Deferred scope

- **[tat-1] Timeline custom-entry model**
  - Reason: dependency-blocked by deciding whether activity events are separate entries or folded into job updates.
  - Depends on: job-registry and structured completion-state decisions.
  - Revisit when: `/team:status` needs event history beyond current job records.
  - Candidate surface: internal mechanic, tests.
- **[tat-2] `/team:status` timeline UI**
  - Reason: waiting for event model and UX validation.
  - Depends on: timeline event persistence.
  - Revisit when: timeline data exists or user needs richer teammate activity inspection.
  - Candidate surface: command, UI.
- **[tat-3] Model-visible activity summaries**
  - Reason: risky for context pressure until truncation and relevance rules are defined.
  - Depends on: structured completion and delegate-result rendering policy.
  - Revisit when: parent agents need timeline context to make resume/follow-up decisions.
  - Candidate surface: tool, internal mechanic.

## What we are designing

A condensed teammate activity and timeline model for pi-teammates that lets the parent agent and human understand multi-teammate progress without flooding the primary conversation with every child-session tool call.

This design is about visibility and state presentation. It is not a new delegation scheduler and it is not a replacement for `delegate`.

## Data and sources

- Local pi-teammates:
  - `src/index.ts` runs child teammate sessions and streams live `SingleResult` updates while `delegate` is executing.
  - `src/job-registry.ts` persists teammate job records as custom session entries.
  - `src/status-widget.ts` displays persisted teammate activity in `/team:status`.
  - `src/manage-widget.ts` displays teammate definitions and source scopes in `/team:manage`.
  - `tests/delegate-rendering.test.ts` guards collapsed delegate rendering state for running teammates.
- Claude Code extracted prompts and data:
  - `system-prompts/data-managed-agents-multiagent-sessions.md`: subagents run in isolated threads with shared filesystem, while the primary stream shows condensed status transitions and cross-thread messages rather than every subagent tool call.
  - `system-prompts/system-prompt-coordinator-mode-orchestration.md`: workers notify the coordinator when done; do not use one worker to check on another; trust but verify worker reports.
  - `system-prompts/tool-description-agent-usage-notes.md`: background agents notify on completion; do not sleep, poll, or proactively check progress.
  - `system-prompts/tool-description-teammatetool.md`: idle teammate notifications are normal and should not be treated as errors.
  - `system-prompts/agent-prompt-background-job-agent-instructions.md`: parseable `result:`, `needs input:`, and `failed:` completion signals.

## Candidate event model

Persist a lightweight timeline entry for major lifecycle transitions instead of raw child-session traffic:

```ts
interface TeammateActivityEvent {
  id: string;
  timestamp: string;
  jobId: string;
  sessionId: string;
  teammateName: string;
  source: "user" | "project" | "builtin" | "unknown";
  phase?: "research" | "synthesis" | "implementation" | "verification" | "review";
  type:
    | "queued"
    | "started"
    | "progress"
    | "message"
    | "needs_input"
    | "completed"
    | "failed"
    | "aborted"
    | "interrupted"
    | "resumed";
  summary: string;
  evidence?: string[];
  nextAction?: string;
  taskPreview?: string;
}
```

The event model should be session-local first and persisted through Pi custom session entries so `/resume`, `/fork`, and compaction keep the activity history available.

## Display surfaces

### 1. `delegate` tool result rendering

Keep the inline delegate renderer condensed:

- show current running/queued/completed counts,
- show the latest event per teammate,
- show session IDs for resume,
- avoid dumping child transcripts,
- include verification reminders when a teammate reports implementation work.

This builds on the fixed display-state bug: `status: "running"` remains authoritative for running state.

### 2. `/team:status` overlay

Extend `/team:status` from job list toward a timeline-aware view:

- current jobs tab: status, teammate, context, model, session, task preview,
- timeline tab or expandable row: recent lifecycle events,
- filters: running, needs input, failed, completed,
- actions: inspect, resume, copy session id, maybe follow up.

Do not show every child tool call by default. A user who wants full detail can inspect the child session.

### 3. Parent-agent model-visible summaries

Expose condensed activity to the parent agent only when it helps orchestration:

- completion summary,
- structured status (`completed | needs_input | failed`),
- evidence / verification hints,
- child session handle for resume.

Avoid injecting volatile timeline noise into the stable system prompt. Prefer tool result details, custom session entries, or runtime reminders near relevant events.

## Behavioral rules

- Child teammate sessions are context-isolated; activity summaries are not shared memory.
- Teammate reports are evidence, not truth; parent must verify consequential claims.
- Idle/running transitions are normal; the parent should not poll or ask one teammate to check another.
- `needs_input` means one human decision/action is required; if a reasonable assumption exists, teammates should continue and note it instead.
- Activity events from teammates do not grant user consent for destructive or external actions.

## Command vs tool implications

User command candidates:

- `/team:status` — primary human-facing timeline/status UI.
- `/team:activity` — optional future shortcut if `/team:status` becomes too broad.

Agent-callable candidates:

- No new tool is required for the initial timeline. The existing `delegate` result can return condensed activity.
- If task-board work lands, `team_task_list` could include recent activity per task.
- If named follow-up lands, `team_message` could append `message` and `resumed` activity events.

Internal mechanics:

- Persist timeline entries as custom session entries.
- Derive lifecycle events from existing job registry updates where possible.
- Parse or classify final teammate responses only after structured completion-state design is settled.

## Open decisions

1. Should activity events be stored as a new custom entry type or folded into `pi-teammates/job` updates?
2. Should `/team:status` add tabs, or should `/team:activity` be a separate command?
3. How many timeline events should be model-visible in `delegate` results before truncation?
4. Should child-session tool-call summaries ever be surfaced automatically, or only through explicit inspect actions?
5. Should `needs_input` be inferred by text parsing, required through teammate prompt footers, or generated by a classifier?
