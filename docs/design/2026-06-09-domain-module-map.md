# pi-teammates Domain Module Map

This document records the production module layout after the behavior-preserving domain-first modularization and the post-refactor cleanup pass.

## Entry Point

- `src/index.ts` stays thin by wiring Pi extension registration and preserving the `formatResolvedModelLabel` compatibility re-export.
- `src/extension/register-events.ts` registers lifecycle/system-prompt events.
- `src/extension/register-commands.ts` registers slash commands.
- `src/extension/register-tools.ts` registers the `delegate` tool.

## Delegate Domain

- `src/delegate/schema.ts` defines the `delegate` tool parameter schema.
- `src/delegate/tool-definition.ts` owns the tool metadata and connects execute/render hooks.
- `src/delegate/execute.ts` validates mode selection and routes single, parallel, chain, and resume calls.
- `src/delegate/single-runner.ts` creates and runs new internal teammate sessions.
- `src/delegate/resume-runner.ts` resumes persisted teammate sessions.
- `src/delegate/runtime.ts` shares child-session runtime setup for fresh and resumed teammate sessions.
- `src/delegate/chain.ts` handles sequential chain execution.
- `src/delegate/parallel.ts` handles parallel task execution.
- `src/delegate/output.ts` formats model-visible result text.
- `src/delegate/render/` formats TUI-visible call/result output.

## Context, Config, Teammates, Jobs, UI

- `src/commands/` handles slash command completions and command implementations for builtin ejection, manual teammate delegation/handoff, new-session summary/handoff transfers, `/team:status`, and shared command-context typing.
- `src/command-helpers.ts` remains as a root-level internal helper for shared slash-command parsing, transcript summaries, teammate template generation, and task-improvement prompts; it is not a compatibility barrel.
- `src/context/` handles context modes, context model refs, context prompts, message extraction, and context packet generation.
- `src/config/` handles default settings, scoped loading, sanitization, merging, and cache invalidation.
- `src/teammates/` handles teammate discovery, parsing, builtins, skills, state, recursion policy, and lineage.
- `src/jobs/` handles teammate job record persistence and queries.
- `src/ui/` handles teammate management/status overlays and shared overlay layout helpers.
- `src/shared/` handles small cross-domain helpers for deduplication and concurrency-limited mapping.

## Internal Import Surface

Internal code and tests import direct domain modules from `src/commands/`, `src/context/`, `src/config/`, `src/delegate/`, `src/jobs/`, `src/teammates/`, `src/ui/`, and `src/shared/` rather than root-level compatibility barrels, with `src/command-helpers.ts` retained as the remaining root-level internal helper.

Historical root shims such as `src/config.ts`, `src/context-transfer.ts`, `src/teammates.ts`, `src/job-registry.ts`, `src/manage-widget.ts`, `src/status-widget.ts`, `src/overlay-layout.ts`, `src/delegate-process.ts`, `src/delegation-policy.ts`, `src/teammate-skills.ts`, `src/teammate-state.ts`, and `src/builtin-teammates.ts` were removed during the cleanup pass. The package entrypoint remains `src/index.ts`; its intentional public export surface is separate from internal domain imports.
