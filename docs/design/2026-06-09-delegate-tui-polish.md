# Delegate TUI Polish Design

**Status:** initial design capture

## Implementation status

- Status: draft
- Target milestone: next
- Owner surface: UI, tests

## Finalized scope

Not finalized for implementation yet. The likely first pass is collapsed renderer polish only, preserving delegate input schema, result details shape, child-session behavior, and expanded rendering semantics.

## Deferred scope

- **[dtp-1] Extract delegate rendering into a separate module**
  - Reason: only needed if `src/index.ts` grows too much during implementation.
  - Depends on: actual implementation size and reviewability.
  - Revisit when: renderer helpers become large or hard to test in place.
  - Candidate surface: UI, tests.
- **[dtp-2] Expanded rendering redesign**
  - Reason: lower priority; collapsed live display is the reported pain point.
  - Depends on: collapsed renderer behavior settling first.
  - Revisit when: expanded output usability becomes a separate user issue.
  - Candidate surface: UI.
- **[dtp-3] Activity timeline integration**
  - Reason: dependency-blocked by the teammate activity timeline event model.
  - Depends on: `2026-06-09-teammate-activity-timeline.md` decisions.
  - Revisit when: timeline events are persisted and available to render.
  - Candidate surface: UI, internal mechanic.

## Goal

Improve the collapsed/live TUI rendering for the `delegate` tool across single, parallel, and chain modes. The display should remove duplicated teammate/task previews, make each delegate run look like a coherent tree, persist the delegated goal under each teammate row, and show richer live metadata without exposing noisy final output in collapsed completed views.

## Current problems

- `renderCall()` repeats teammate/task previews that are also shown by `renderResult()`, producing duplicate information.
- Single delegate rendering has an awkward split between the task preview, teammate/model line, and running tool list.
- Parallel completed rendering separates the summary line from per-teammate goal context, making it less tree-like.
- Running rows do not consistently show usage/model metadata as it becomes available.
- Completed collapsed views include output previews that make the result visually heavy; full output belongs in expanded view.

## Design

### Shared layout rules

- Keep `renderCall()` to the concise tool title only:
  - `Delegate(Reviewer)` for single mode.
  - `Delegate(3 tasks) [new]` for parallel mode with context override.
  - `Delegate(chain · 3 steps) [handoff]` for chain mode with context override.
- Move all task/goal previews into `renderResult()`.
- Render collapsed results as a tree rooted by `⎿`.
- Each teammate/step row should contain:
  - teammate name, or `Step N: Teammate` for chain mode;
  - live/final usage metadata when available: turns, tokens, cost, model;
  - a persistent `Goal:` child line using the delegated task preview;
  - latest tool-call child rows while running;
  - `Done ✓`, `Error ✗`, or `Waiting…` terminal/status child rows.
- Avoid duplicated labels such as `Goal: Goal:` by stripping a leading `Goal:` prefix from task previews before adding the UI label.
- Keep `(Ctrl+O to expand)` in collapsed views when detailed output is available.

### Single mode collapsed rendering

Running single delegate:

```text
Delegate(Reviewer)
⎿ Reviewer  · 5 turns · 12k tokens · $0.0412 · anthropic/claude-opus-4-8:high
  ├  Goal: Review only Task 7 work for spec compliance against docs/pla…
  ├  … +6 tool uses
  ├  Read(~/.pi/agent/custom-extensions/pi-agent-skills/src/types.ts:54-98)
  ├  Read(~/.pi/agent/custom-extensions/pi-agent-skills/docs/specs/2026-06-09-pi-agent-skills-design.md:260-329)
  └  Bash(cd /home/arnold/.pi/agent/custom-extensions/pi-agent-skills …)
       Running…

(Ctrl+O to expand)
```

Completed single delegate:

```text
Delegate(Reviewer)
⎿ Reviewer  · 6 turns · 16k tokens · $0.1725 · anthropic/claude-opus-4-8:high
  ├  Goal: Review only Task 7 work for spec compliance against docs/pla…
  ⎿  Done ✓

(Ctrl+O to expand)
```

Expanded single mode continues to show full task, tool calls, output markdown, errors, and usage details.

### Parallel mode collapsed rendering

Running parallel delegate:

```text
Delegate(3 tasks) [new]
⎿ parallel 0/3 done · 3 running
  ├ Researcher  · 5 turns · 10k tokens · $0.0281 · deepseek/deepseek-v4-pro:high
  │ ├  Goal: Analyze the referenced repo https:…
  │ └  Read(~/.cache/pi-searxng/git/github.com/Piebald-AI/claude-code-system-prompts/)
  │      Running…
  ├ Explorer  · 22 turns · 69k tokens · $0.0143 · deepseek/deepseek-v4-flash:high
  │ ├  Goal: Inspect Pi local docs/code for fea…
  │ └  Read(~/.asdf/installs/nodejs/24.14.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/skills.d.ts)
  │      Running…
  └ Researcher  · 10 turns · 53k tokens · $0.0275 · deepseek/deepseek-v4-pro:high
    ├  Goal: Research Handlebars features and c…
    └  Web_search({"query":"Handlebars SafeString raw HTML triple br…)
         Running…

(Ctrl+O to expand)
```

Completed parallel delegate:

```text
Delegate(3 tasks)
⎿ parallel 3/3 teammates finished ✓
  ├ Researcher  · 17 turns · 49k tokens · $0.0281 · deepseek/deepseek-v4-pro:high
  │ ├  Goal: Analyze the referenced repo https:…
  │ ⎿  Done ✓
  ├ Explorer  · 22 turns · 69k tokens · $0.0143 · deepseek/deepseek-v4-flash:high
  │ ├  Goal: Inspect Pi local docs/code for fea…
  │ ⎿  Done ✓
  └ Researcher  · 10 turns · 53k tokens · $0.0275 · deepseek/deepseek-v4-pro:high
    ├  Goal: Research Handlebars features and c…
    ⎿  Done ✓

Total: 49 turns · 2.0M tokens · $0.0699
(Ctrl+O to expand)
```

Failure rows use `Error ✗` and include the stop reason when available.

### Chain mode collapsed rendering

Running chain delegate:

```text
Delegate(chain · 3 steps) [handoff]
⎿ chain 1/3 steps done · step 2 running
  ├ Step 1: Explorer  · 8 turns · 21k tokens · $0.0041 · deepseek/deepseek-v4-flash:high
  │ ├  Goal: Inspect the current rendering implementation…
  │ ⎿  Done ✓
  ├ Step 2: Worker  · 3 turns · 9k tokens · $0.0063 · deepseek/deepseek-v4-pro:high
  │ ├  Goal: Implement the renderer changes using previous findings…
  │ └  Edit(src/index.ts)
  │      Running…
  └ Step 3: Reviewer
    ├  Goal: Review the implementation after Worker completes…
    ⎿  Waiting…

(Ctrl+O to expand)
```

Completed chain delegate:

```text
Delegate(chain · 3 steps)
⎿ chain 3/3 steps finished ✓
  ├ Step 1: Explorer  · 8 turns · 21k tokens · $0.0041 · deepseek/deepseek-v4-flash:high
  │ ├  Goal: Inspect the current rendering implementation…
  │ ⎿  Done ✓
  ├ Step 2: Worker  · 14 turns · 38k tokens · $0.0192 · deepseek/deepseek-v4-pro:high
  │ ├  Goal: Implement the renderer changes using previous findings…
  │ ⎿  Done ✓
  └ Step 3: Reviewer  · 5 turns · 15k tokens · $0.0084 · deepseek/deepseek-v4-flash:high
    ├  Goal: Review the implementation after Worker completes…
    ⎿  Done ✓

Total: 27 turns · 74k tokens · $0.0317
(Ctrl+O to expand)
```

Chain steps not yet started should render from the original `chain` input if available. If result details do not contain queued step definitions, omit future waiting rows rather than guessing.

## Open decisions

1. Should collapsed renderer polish be implemented before or after delegation-orchestration prompt changes?
2. Should renderer helpers stay in `src/index.ts` for now, or be extracted before adding more tests?
3. Should chain waiting rows require queued step definitions in details, or continue to omit unavailable future steps?

## Implementation notes

- Add small renderer helpers in `src/index.ts` unless the file grows too much; if the change becomes large, extract delegate rendering helpers into a separate module.
- Candidate helpers:
  - `formatTaskGoal(task: string, maxLength: number): string`
  - `formatResultHeader(result: SingleResult, options?: { step?: number }): string`
  - `formatLatestToolTreeLines(...)`
  - `formatCompletionLine(result: SingleResult): string`
- Continue using `formatUsageStats()` for turns/tokens/cost/model metadata.
- Continue using `getDisplayItems()` and `formatToolCall()` for child tool-call rows.
- Preserve expanded rendering behavior, but align section labels if needed.
- Keep result details shape stable so resume flows and model-visible output are unaffected.

## Testing

Update `tests/delegate-rendering.test.ts` to cover:

1. Parallel live results render as `parallel 0/N done · N running`, include goal lines, include running tool-call rows, and do not say teammates are finished.
2. Parallel completed results render `parallel N/N teammates finished ✓`, include per-teammate goal lines, per-teammate `Done ✓`, and total usage.
3. Single running results render one tree rooted by the teammate row, include `Goal:`, hidden tool count, latest tool calls, and `Running…`.
4. Single completed results render goal plus `Done ✓` and do not include the final markdown output preview in collapsed mode.
5. Goal formatting strips a leading `Goal:` from task text before adding the UI label.
6. Existing running-state regression stays covered: `status: "running"` with `exitCode: 0` must not render as completed.

Run `npm test` after implementation.

## Non-goals

- No changes to delegate input schema.
- No changes to delegate result details shape.
- No changes to child session creation, resume behavior, teammate prompts, or context-transfer behavior.
- No browser-based mockup tooling for this design; terminal wireframes are sufficient.
