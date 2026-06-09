# pi-teammates Domain Module Map

This document records the production module layout after the behavior-preserving domain-first modularization.

## Entry Point

- `src/index.ts` wires Pi extension registration only.
- `src/extension/register-events.ts` registers lifecycle/system-prompt events.
- `src/extension/register-commands.ts` registers slash commands.
- `src/extension/register-tools.ts` registers the `delegate` tool.

## Delegate Domain

- `src/delegate/schema.ts` defines the `delegate` tool parameter schema.
- `src/delegate/tool-definition.ts` owns the tool metadata and connects execute/render hooks.
- `src/delegate/execute.ts` validates mode selection and routes single, parallel, chain, and resume calls.
- `src/delegate/single-runner.ts` creates and runs new internal teammate sessions.
- `src/delegate/resume-runner.ts` resumes persisted teammate sessions.
- `src/delegate/chain.ts` handles sequential chain execution.
- `src/delegate/parallel.ts` handles parallel task execution.
- `src/delegate/output.ts` formats model-visible result text.
- `src/delegate/render/` formats TUI-visible call/result output.

## Context, Config, Teammates, Jobs, UI

- `src/context/` handles context modes, context model refs, context prompts, message extraction, and context packet generation.
- `src/config/` handles default settings, scoped loading, sanitization, merging, and cache invalidation.
- `src/teammates/` handles teammate discovery, parsing, builtins, skills, state, recursion policy, and lineage.
- `src/jobs/` handles teammate job record persistence and queries.
- `src/ui/` handles teammate management/status overlays and shared overlay layout helpers.

## Compatibility Barrels

The root files `src/config.ts`, `src/context-transfer.ts`, `src/teammates.ts`, `src/job-registry.ts`, and related historical root files re-export from the new domain folders to preserve existing internal import paths and tests.
