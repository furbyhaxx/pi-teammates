# Delegation Orchestration Design Capture

**Status:** initial design capture

## Implementation status

- Status: draft
- Target milestone: now
- Owner surface: tool, internal mechanic, docs, tests

## Finalized scope

Recommended for the first finalization/implementation pass:

- strengthen the delegation brief quality contract in model-facing guidance,
- improve spawn-vs-resume guidance without adding new API shape,
- add trust-but-verify reminders for implementation/fix delegate results,
- preserve and clarify one-level delegation defaults.

## Deferred scope

- **[del-1] Optional `phase` field**
  - Reason: useful but expands schema, rendering, docs, and tests beyond the smallest v1.
  - Depends on: stable brief-quality and resume-policy guidance.
  - Revisit when: v1 prompt/policy changes are verified and a status/task integration needs phase labels.
  - Candidate surface: tool, UI, internal mechanic.
- **[del-2] Named follow-up / `team_message`**
  - Reason: API choice is unresolved; existing `resumeSessionId` already supports continuation.
  - Depends on: decision whether follow-up belongs inside `delegate` or a separate tool.
  - Revisit when: repeated resume UX friction is observed or activity timeline work needs named messages.
  - Candidate surface: tool, command.
- **[del-3] `/team:batch` orchestration**
  - Reason: larger workflow that depends on core delegation behavior being reliable first.
  - Depends on: task-board/goal-state decisions or a consciously prompt-only initial command.
  - Revisit when: delegation v1 is implemented and verified.
  - Candidate surface: command, internal mechanic.

## What we are designing

A stronger delegation orchestration model for pi-teammates: better parent-agent delegation briefs, explicit work phases, spawn-vs-resume choices, structured follow-up, and verification discipline.

## Data and sources

- Local pi-teammates:
  - `src/index.ts` implements `delegate` single, parallel, chain, and resume modes.
  - `src/delegation-policy.ts` injects current delegation policy and teammate roster.
  - `src/command-helpers.ts` implements `/team:delegate --improve` prompt rewriting.
  - `src/job-registry.ts` persists child job records.
- User feedback:
  - Slash commands are user-invoked; agent-triggered behavior needs tools or internal mechanics.
- Claude Code extracted prompts:
  - `system-prompts/system-prompt-coordinator-mode-orchestration.md`: parallelism, worker lifecycle, trust-but-verify, continue-vs-spawn guidance.
  - `system-prompts/system-prompt-writing-subagent-prompts.md`: self-contained delegation prompts and “never delegate understanding”.
  - `system-prompts/tool-description-agent-usage-notes.md`: foreground/background distinction and continuation semantics.
  - `system-prompts/agent-prompt-worker-fork.md`: inherited-context worker prompt and one-directive execution.
  - `system-prompts/data-managed-agents-multiagent-sessions.md`: isolated threads, shared filesystem, condensed activity, one-level delegation.

## Candidate mechanics

### 1. Delegation brief quality contract

Every delegated task should include:

- concrete objective,
- purpose / why the result matters,
- relevant files, symbols, or commands when known,
- constraints and risks,
- expected output format,
- what has already been tried or ruled out when relevant.

This belongs in both:

- the `delegate` tool prompt guidelines,
- `/team:delegate --improve` output rules.

### 2. Optional phase field

Add a phase concept to delegation requests.

Candidate values:

- `research`
- `synthesis`
- `implementation`
- `verification`
- `review`

Potential placements:

- `delegate({ teammate, task, phase })`
- `delegate({ tasks: [{ teammate, task, phase }] })`
- `delegate({ chain: [{ teammate, task, phase }] })`

Uses:

- status overlay labels,
- output expectations,
- prompt steering,
- default context recommendations,
- future task-board integration.

### 3. Spawn vs resume decision policy

Current `resumeSessionId` is functional but model guidance can improve.

Proposed policy:

- Resume when the same teammate has useful loaded context and the follow-up directly depends on its prior investigation.
- Spawn fresh when verifying someone else’s implementation, checking assumptions, or changing direction significantly.
- Spawn fresh when prior context may bias the result.

### 4. Verification after teammate work

Teammate reports should be treated as evidence, not truth.

Internal mechanic candidate:

- When `delegate` returns implementation or fix results, the tool result or prompt policy should remind the parent to inspect diffs and run verification before claiming completion.

### 5. One-level delegation policy

pi-teammates already limits recursion by lineage and disables `delegate` by default in teammates.

Future design should preserve this as the default:

- Parent owns orchestration.
- Teammates execute bounded work.
- Recursive delegation requires explicit teammate `tools.delegate: true` and lineage checks.

## Command vs tool implications

User commands can start orchestration workflows:

- `/team:batch [goal]`
- `/team:goal [goal]`

Agent-callable mechanics should be tools or extensions of `delegate`:

- optional `phase`,
- structured resume/follow-up,
- future `team_task_*` tools.

## Open decisions

1. Should `phase` be purely advisory, or should it change context defaults?
2. Should `delegate` support named follow-up by teammate name, or only `resumeSessionId`?
3. Should `/team:batch` be a guided user command only, or should it also install a model-facing team goal/task state?
4. Should implementation-phase delegate calls require a verification-phase follow-up before the tool result is considered complete?
