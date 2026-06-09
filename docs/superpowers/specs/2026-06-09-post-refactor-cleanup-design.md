# pi-teammates Post-Refactor Cleanup Design

## Status

Approved for planning. This is a follow-up cleanup pass after the domain-first modularization. Import-path/API breakage is allowed for this pass as long as all affected internal parts are refactored consistently.

## Context

The domain-first modularization succeeded and preserved behavior, but several follow-up cleanup opportunities remained:

- duplicated child-session runtime setup across fresh teammate runs and resumed teammate runs;
- `team:status` resume workflow still embedded in command registration wiring;
- repeated complex command-context typing across command modules;
- broad compatibility-barrel exports preserving historical root module paths even though the user now allows API/import-path cleanup.

This pass should resolve those candidates comprehensively rather than leaving the codebase half-modernized.

## Goals

- Extract a shared child-session runtime helper used by both fresh and resumed teammate sessions.
- Move the remaining `team:status` workflow into a dedicated command module.
- Introduce shared internal command-context typing to remove repeated inferred command handler types.
- Remove or sharply narrow historical compatibility barrels and update all internal imports/tests accordingly.
- Keep user-visible extension behavior unchanged where practical.
- Preserve package integrity, tests, and documentation after the cleanup.

## Non-goals

- No new user-facing features.
- No intentional changes to `delegate` semantics, teammate behavior, or persisted job/session data beyond what is necessary for the cleanup.
- No large architectural rewrite beyond the surfaced cleanup candidates.

## Recommended Approach

Use a structural cleanup pass:

1. factor shared child-session runtime setup into a reusable delegate runtime helper;
2. extract `team:status` command workflow into `src/commands/status.ts`;
3. create a shared internal command context alias/module;
4. remove compatibility barrels that only exist to preserve old structure, then update imports/tests to the new domain paths.

## Target Outcomes

### 1. Shared delegate child-session runtime helper

Extract the common logic currently duplicated across:

- `src/delegate/single-runner.ts`
- `src/delegate/resume-runner.ts`

The shared helper should own:

- child `SettingsManager` creation;
- child `DefaultResourceLoader` loading;
- injected skill prompt construction;
- session resource loader setup;
- session binding and extension error plumbing;
- effective model tracking;
- snapshot synchronization and progress emission;
- abort listener wiring and cleanup.

Fresh-run and resume-runner modules should only own the parts that are genuinely different:

- session manager creation/opening;
- job record creation/update semantics;
- delegated task prompt vs `agent.continue()`;
- initial state setup specific to a new child session.

### 2. Dedicated `team:status` command module

Move the `team:status` command workflow out of `src/extension/register-commands.ts` into a dedicated module, likely:

- `src/commands/status.ts`

`src/extension/register-commands.ts` should only wire registrations and call focused command functions.

### 3. Shared command context alias

Introduce a small internal typing module, likely:

- `src/commands/types.ts`

This should define a reusable alias for the Pi command handler context currently repeated in multiple modules.

### 4. Remove compatibility-barrel debt

Because the user explicitly allows API/import-path breakage for this pass, historical root compatibility barrels should be removed or reduced aggressively.

Likely candidates include:

- `src/config.ts`
- `src/context-transfer.ts`
- `src/teammates.ts`
- `src/job-registry.ts`
- `src/manage-widget.ts`
- `src/status-widget.ts`
- `src/overlay-layout.ts`
- `src/delegate-process.ts`
- `src/delegation-policy.ts`
- `src/teammate-skills.ts`
- `src/teammate-state.ts`
- `src/builtin-teammates.ts`

Internal imports and tests should be rewritten to direct domain paths instead of depending on those root shims.

If any root barrel still provides genuine structural value rather than legacy compatibility, it may remain, but only intentionally and narrowly.

## Expected File-Structure Direction

The cleaned structure should emphasize domain paths directly:

```text
src/
  index.ts
  extension/
  commands/
  delegate/
  context/
  config/
  teammates/
  jobs/
  ui/
  shared/
```

Root-level historical single-domain shim files should no longer be the normal import surface for internal code and tests.

## Behavior Expectations

- User-facing command behavior should remain the same.
- `delegate` behavior, rendering, prompts, persistence, and resume flows should remain functionally the same.
- Test expectations may change only where they referenced now-removed legacy import paths.
- Any accidental behavior drift discovered during cleanup should be treated as a regression and fixed immediately.

## Validation

Required validation for this cleanup pass:

- `npm test`
- `npm pack --dry-run`
- line-count check for production TypeScript
- focused confidence around delegate resume/shared runtime setup

If practical, add or retain validation that exercises the shared resume path more directly than before.

## Documentation Updates

Update as part of the cleanup pass:

- `CHANGELOG.md`
- `docs/design/2026-06-09-domain-module-map.md`
- `docs/design/refactor-follow-up-optimizations.md`

If compatibility barrels are removed, the module map should reflect the direct domain import structure.

## Approval

The approved direction is to resolve all surfaced cleanup candidates, including export/import-path cleanup, in one focused follow-up pass.
