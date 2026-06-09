# Delegate Display State Bug Design Note

**Status:** implemented

## Implementation status

- Status: implemented
- Target milestone: now
- Owner surface: UI, tests

## Finalized scope

Implemented scope:

- treat `status: "running"` as authoritative for live running delegate results,
- preserve `exitCode: -1` as fallback placeholder/running state,
- add a regression test against the actual registered `delegate.renderResult()` surface.

## Deferred scope

No deferred scope. Future activity timeline work belongs in `2026-06-09-teammate-activity-timeline.md`.

## What we are designing/fixing

The collapsed delegate renderer must not show running teammates as completed. Live running updates should remain visibly running in both aggregate counts and per-teammate rows.

## Data and sources

- User report in `ISSUES.md`:
  - During multi-agent delegation the UI instantly shows `✓ 2 teammates finished` and `Done` rows.
  - Expanded view shows agents are still working.
- Local code evidence:
  - `src/index.ts` initializes a running `currentResult` with `exitCode: 0` and later sets `status = "running"`.
  - Parallel renderer previously counted running/done using `exitCode === -1` / `exitCode !== -1`.
  - Parallel placeholders use `exitCode: -1`, but real live updates from `runSingleTeammate()` carry `status: "running"` with `exitCode: 0`.

## Root cause

The renderer used `exitCode` as the authoritative lifecycle signal. During live updates, `exitCode` is still the default success value (`0`) while `status` correctly says `running`. This causes the collapsed parallel view to count running teammates as finished.

## Desired behavior

- `status: "running"` is authoritative for live running state.
- Placeholder results with no status and `exitCode: -1` remain treated as running/queued.
- Finished counts use explicit non-running state.
- Failed/success labels are only shown for non-running results.

## Regression test

`tests/delegate-rendering.test.ts` registers the real extension, calls `delegate.renderResult()`, and verifies that parallel results shaped like live updates (`status: "running"`, `exitCode: 0`) render as running rather than finished/done.

## Acceptance criteria

- Regression test fails against the old renderer.
- Regression test passes after the fix.
- Full `npm test` passes.
- `ISSUES.md` records the root cause and fixed status.
