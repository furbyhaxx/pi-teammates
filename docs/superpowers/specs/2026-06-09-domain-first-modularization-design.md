# pi-teammates Domain-First Modularization Design

## Status

Approved for planning. This design is behavior-preserving: it reorganizes the codebase without changing public extension behavior.

## Context

`pi-teammates` works functionally, but several TypeScript files have grown beyond the repository conventions. The main offender is `src/index.ts`, which currently combines extension registration, delegate execution, resume handling, commands, rendering, formatting, schema definitions, and session/job orchestration. The repository rules explicitly prohibit 800+ SLoC TypeScript files, and the shared `.pi/AGENTS.md` conventions prefer domain modules, clear public documentation, and focused files.

The refactor should split all production code by domain, not only `src/index.ts`, while preserving behavior exactly.

## Goals

- Keep the package entrypoint at `src/index.ts`.
- Preserve all public behavior and persisted data shapes.
- Reduce production TypeScript files to focused domain modules, targeting roughly 300-500 SLoC per file.
- Leave rare exceptions up to roughly 700 SLoC only when justified, such as complex TUI components or tests.
- Improve navigability so future changes can target a single domain without loading a monolithic file.
- Capture optimization opportunities discovered during the split for follow-up work, without implementing them in this pass.

## Non-goals

- No changes to `delegate` semantics, schema, result details, prompts, or rendering behavior.
- No changes to command names or user-facing command behavior.
- No changes to teammate frontmatter semantics.
- No changes to session persistence, custom entry types, job record shape, child session ownership, or resume mechanics.
- No optimization or redesign unless required to preserve behavior after moving code.

## Recommended Approach

Use a domain-first modularization. Move existing logic into cohesive modules, then keep `src/index.ts` as a thin extension factory that delegates registration to domain modules.

Rejected alternatives:

1. Minimal extraction: lower risk, but does not satisfy the request to reorganize and split everything.
2. Full architecture rewrite: may be cleaner eventually, but creates unnecessary behavior-regression risk for this pass.

## Target Architecture

Exact file names may adjust during implementation, but the target shape is:

```text
src/
  index.ts                         # thin extension entrypoint

  extension/
    register-events.ts
    register-commands.ts
    register-tools.ts

  delegate/
    schema.ts
    types.ts
    tool-definition.ts
    execute.ts
    single-runner.ts
    resume-runner.ts
    chain.ts
    parallel.ts
    output.ts
    render/
      render-call.ts
      render-result.ts
      format.ts

  commands/
    manual-delegate.ts
    session-transfer.ts
    eject.ts
    completions.ts

  context/
    modes.ts
    model-refs.ts
    prompts.ts
    generate.ts
    messages.ts

  config/
    defaults.ts
    load.ts
    sanitize.ts
    merge.ts

  teammates/
    types.ts
    parse.ts
    discover.ts
    builtins.ts
    skills.ts
    policy.ts
    state.ts

  jobs/
    types.ts
    records.ts
    queries.ts

  ui/
    manage/
      index.ts
      actions.ts
      component.ts
    status/
      index.ts
      component.ts
      actions.ts
    overlay-layout.ts

  shared/
    concurrency.ts
    formatting.ts
    paths.ts
```

## Public Behavior Preservation

The implementation must preserve:

- Pi package manifest behavior: `package.json` keeps `pi.extensions: ["./src/index.ts"]`.
- `delegate` tool:
  - name, label, schema, descriptions, prompt snippet, and prompt guidelines;
  - single, parallel, chain, and resume modes;
  - progress streaming behavior;
  - `details` shape and fields;
  - collapsed and expanded TUI rendering behavior.
- Commands:
  - `/team:delegate`;
  - `/team:handoff`;
  - `/summarize`;
  - `/handoff`;
  - `/team:status`;
  - `/team:eject`;
  - `/team:manage`.
- Teammate discovery and parsing semantics, including user/project/builtin precedence and warning behavior.
- Context-transfer modes and model-selection fallback behavior.
- Job/session persistence:
  - custom entry type strings;
  - job record fields;
  - teammate session state fields;
  - child session directory structure;
  - internal-only parent-owned teammate sessions;
  - resume-by-session-id behavior.
- Existing test-observed exports, or equivalent exports with tests updated only for moved import paths.

## Data Flow Boundaries

The refactor should make these flows explicit:

1. Extension startup registers events, commands, and the delegate tool.
2. `before_agent_start` discovers available teammates and injects the team prompt block only when `delegate` is active.
3. `delegate` execution validates the selected mode, discovers teammates, checks recursion, and routes to single, parallel, chain, or resume execution.
4. A single teammate run resolves tools, context mode, model, skills, system prompt mode, session manager, job record, resource loader, and child session lifecycle.
5. Resume opens the persisted child session and continues it using the stored job record.
6. Output helpers format model-visible content and rendering helpers format TUI-visible components.
7. Commands reuse the same execution helpers where possible without changing command behavior.

## Error Handling Strategy

This refactor should preserve current error behavior, including model-visible failure text and command notifications. If raw or confusing errors are discovered, record them in the deferred optimization backlog rather than changing them during this pass.

New internal helper boundaries should still avoid swallowing errors accidentally. Moved code should keep existing catch/finally cleanup behavior, especially child session disposal, unsubscribe cleanup, abort listener cleanup, and job status updates.

## Testing and Validation

Validation plan:

1. Run `npm test` before implementation to establish the baseline.
2. Move code in small domain slices.
3. Run targeted tests after high-risk moves when practical.
4. Run final `npm test`.
5. Run `npm pack --dry-run` if package metadata, published file lists, or package-loading paths are touched.

Because behavior must be preserved, failing tests should generally be treated as refactor regressions unless the test only imports from an internal path that intentionally moved.

## Documentation and Changelog

- Update `CHANGELOG.md` in the same change as any docs/code edits.
- README and examples should not change unless behavior-facing text becomes inaccurate.
- Internal architecture documentation may be added or updated if it helps future maintainers understand the new module map.

## Deferred Optimization Backlog

During implementation, collect follow-up opportunities without implementing them. Record each opportunity with:

- affected module/file;
- observed issue;
- potential improvement;
- risk/impact;
- suggested validation.

Likely categories include:

- duplicate setup between fresh teammate runs and resume runs;
- repeated resource-loader and skill-injection setup;
- repeated result/status formatting;
- opportunities for a clearer structured error envelope for delegate failures;
- simplification of delegate TUI rendering helpers;
- config/discovery cache invalidation refinements;
- stronger live validation for real delegate resume/recovery flows.

A follow-up document such as `docs/design/refactor-follow-up-optimizations.md` may be created during implementation if the backlog becomes substantial.

## Approval

The approved direction is domain-first modularization with strict behavior preservation and a deferred optimization backlog.
