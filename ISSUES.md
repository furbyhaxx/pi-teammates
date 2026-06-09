
# Display Bug

Status: fixed and verified with `npm test`.

When delegating to agents (not sure if only when mutliple or also single) it instantly shows the agents as finished, then shows a line `x teammates finished` then displays the agents and their working status (despite most of the time it shows them as done while in expanded view CTRL+O they are clearly working)

```

 Delegate(2 tasks) [new]
 ⎿  Researcher Analyze the cloned repo at /home/arnold/…
 ⎿  Explorer Analyze the local pi-teammates extension…
 ✓ 2 teammates finished
    ├ Researcher  · 5 turns · 27k tokens · $0.0126 · deepseek/deepseek-v4-pro:high
    │ ⎿  Done
    └ Explorer  · 5 turns · 68k tokens · $0.0100 · deepseek/deepseek-v4-flash:high
      ⎿  Done

 Total: 10 turns · 231k tokens · $0.0226
 (Ctrl+O to expand)
 ```

 So there is clearly a display, state and live update bug.

## Root cause

The collapsed parallel renderer used `exitCode === -1` as the running-state signal and `exitCode !== -1` as finished. Real live updates from `runSingleTeammate()` carry `status: "running"` while `exitCode` is still initialized to `0`, so the collapsed view incorrectly counted live running teammates as completed.

## Fix

- Added `tests/delegate-rendering.test.ts` to reproduce the live update shape against the actual registered `delegate.renderResult()` renderer.
- Updated renderer/progress counts to treat `status: "running"` as authoritative while keeping `exitCode: -1` as the fallback for placeholder queued/running entries.

## Verification

- `npm test` passed after the fix, including `tests/delegate-rendering.test.ts`.

## Related design note

See `docs/design/2026-06-09-display-state-bug.md`.