# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses conventional commits.

## [Unreleased]

### Added

- Added a copy-pastable `examples/settings.json` (comment-free) alongside the annotated `examples/settings.jsonc` for pasting straight into a real Pi `settings.json`.
- Added an `eval/` delegation-routing A/B harness (and README) that measures whether the delegation prompt wording improves routing decisions, comparing the current wording head-to-head against the previous wording on fixed scenarios.
- Added optional `teammates.context.summarySystemPrompt` and `handoffSystemPrompt` settings for overriding the builtin context-transfer prompts.
- Added optional `teammates.context.contextMaxChars` setting that truncates the serialized conversation (keeping the most recent content) before sending it to the context-generation model, bounding cost and avoiding input-limit failures on long sessions.
- Added a `source` field to persisted teammate job records so resumed sessions display the correct user/project scope instead of `(unknown)`.
- Added a `warnings` list to teammate discovery results so malformed teammate files surface as visible warnings (in the delegate tool output and the `/team:manage` footer) instead of being silently dropped.
- Added builtin teammate fallback profiles (`Documenter`, `Explorer`, `IssueAnalyst`, `Researcher`, `Reviewer`, `Worker`) loaded from `examples/teammates/` when no user or project teammate files exist.
- Added `/team:eject project|user [--overwrite]` for copying builtin teammates into editable project or user-scoped teammate files.
- Added split design captures under `docs/design/` for Claude Code-inspired pi-teammates improvements: command/tool boundaries, delegation orchestration, context steering/state, delegate TUI polish, teammate activity timelines, task-board workflows, teammate recruiting, and the display-state bug. Added a central `docs/design/README.md` with design status, backlog/deferral conventions, and recommended implementation order.
- Added `recruiting-teammates` skill covering both user-requested and agent-autonomous teammate creation, including a requirements interview, teammate spec design guide, file placement, and a test-delegation validation loop. Registered `./skills` in the pi package manifest so the skill ships with the extension.
- Added the `delegate` tool with single, parallel, and chained teammate execution.
- Added scoped teammate discovery from `${PI_CODING_AGENT_DIR}/teammates/**/*.md` and nearest ancestor `.pi/teammates/**/*.md` directories.
- Added `teammates` settings for project loading, parallelism limits, collapsed output count, output caps, and tool aliases.
- Added teammate frontmatter support for `tools` maps, `delegate`, `model`, and `prompt: append|replace`.
- Added parsed and persisted teammate `skills` frontmatter lists as groundwork for skill-loading resume flows.
- Added teammate context strategies with frontmatter `context: new|inherit|summary|handoff` plus a matching `delegate.context` override.
- Added configurable `teammates.context.models`, `summaryModels`, and `handoffModels` lists for context-packet generation, with current-session-model fallback.
- Added internal persisted teammate sessions plus custom-entry job records so delegate runs can be resumed by child session id.
- Added `/team:delegate` and `/team:handoff` commands for manual child-session offloading with optional `--improve` task refinement.
- Added `/summarize` and `/handoff` commands for creating a new normal Pi session from generated summary/handoff packets.
- Added `/team:status` live teammate-activity overlay and `/team:manage` interactive teammate manager commands.
- Added recursion guards and dynamic teammate XML prompt injection.
- Added unit tests for config loading, teammate discovery, delegation policy, process planning, context-transfer helpers, and teammate job registry state.
- Added command-helper tests covering user command argument parsing, transcript summaries, and teammate template generation.
- Added example teammate definitions under `examples/teammates/`.
- Added a commented `examples/settings.jsonc` file documenting all extension config knobs, defaults, and value shapes.
- Added a repository-local `AGENTS.md` file with package-specific rules for delegate behavior, teammate session persistence, docs sync, and validation.

### Changed

- Resolved the post-refactor cleanup pass by sharing delegate child-session runtime setup, extracting the remaining `team:status` workflow, introducing shared command-context typing, and removing legacy compatibility barrels in favor of direct domain imports.
- Updated the delegate test model-label helper import to use the direct delegate domain module.
- Removed legacy root compatibility barrels in favor of direct domain imports across internal modules and tests.
- Narrowed the shared delegate child-session runtime API so fresh and resumed runners own teammate job persistence directly.
- Shared delegate child-session runtime setup between fresh and resumed teammate sessions while preserving runner behavior.
- Extracted the `/team:status` workflow into a command module and introduced shared command-context typing while preserving command behavior.
- Refined the domain module map to reflect the current entrypoint compatibility export plus the commands and shared helper domains.
- Refactored production TypeScript into focused domain modules while preserving `delegate`, command, teammate discovery, context-transfer, job persistence, and TUI behavior.
- Split teammate overlay layout, manager, and status UI internals into focused UI modules while preserving behavior.
- Split teammate discovery, builtin teammate helpers, teammate state/policy/process helpers, and job registry internals into focused domain modules while preserving behavior.
- Split config loading, defaults, sanitization, merge helpers, and cache internals into focused config modules while preserving behavior.
- Dropped out-of-scope context index assertions from the context-transfer test while keeping the context-module split intact.
- Split context-transfer internals into focused context modules; the temporary root compatibility barrel was removed in the later cleanup pass.
- Extracted slash command handlers and extension event registration into focused command/extension modules while preserving behavior.
- Tightened extracted delegate execution typing, made delegate parameters derive from the TypeBox schema, and moved teammate job lookup into the job registry while preserving behavior.
- Extracted delegate schema, execution routing, and tool registration into focused delegate/extension modules while preserving existing behavior.
- Extracted delegate session runner primitives and teammate resume logic into focused delegate modules while preserving existing behavior.
- Extracted delegate rendering formatters and render hooks into focused delegate render modules while preserving existing behavior.
- Extracted shared delegate result types, model resolution, output formatting, and display item helpers into focused delegate modules while preserving existing behavior.
- Documented the approved domain-first modularization design and implementation plan for a behavior-preserving refactor of the extension internals.
- Documented the approved post-refactor cleanup design and implementation plan covering shared runtime setup, command extraction, and compatibility-barrel removal.
- Reworked collapsed `delegate` TUI rendering for single, parallel, and chain modes into tree-style teammate rows with persistent goal lines, richer live usage/model metadata, cleaner done/error status rows, and less duplicated task preview noise.
- Moved teammate delegation enablement into the teammate `tools` map as `tools.delegate` instead of a separate top-level frontmatter key.
- Updated all example teammate files to use the stronger project-style PascalCase teammate profiles, which now also serve as the builtin fallback roster.
- Updated all example teammate files to declare `prompt: append` explicitly so the prompt mode is documented in-place.
- Updated all example teammate files to declare `context: new` explicitly so the default context-transfer mode is shown in-place.
- Updated example teammate profiles to demonstrate non-empty `skills` lists.
- Reworked the bundled teammate profiles into stricter operating-policy prompts with sharper descriptions, aligned skills, narrower tool intent, and allowed-model selections.
- Tightened the manual `--improve` task-rewriter prompt and the injected parent delegation-policy prompt so teammate handoffs are more concrete and context-aware.
- Reworked the `delegate` tool description, prompt snippet, and prompt guidelines so tool routing, context-mode choice, resume behavior, and delegation-task quality are specified more explicitly.
- Updated delegate result rendering to display the child session's effective model plus thinking level instead of dropping the `:thinking` suffix from live TUI output.
- Propagated the effective child model/thinking label into `/team:status` job details, manual delegation transcript summaries, and the final `delegate` tool content returned to the calling agent.
- Reworked `/team:status` and `/team:manage` overlays to use responsive large-modal sizing, tall content-padded desktop heights, and adaptive column widths instead of the default narrow centered overlay.
- Reworked the `delegate` tool description, prompt guidelines, and the injected delegation-policy block to lead with decompose-then-batch and parallel-first delegation, discouraging the common anti-pattern of sequential single delegations for independent work. Added an explicit "collapse multiple delegate calls into one `tasks` call" instruction after an A/B evaluation showed agents still occasionally emitting several single calls in one turn for independent subtasks. On the eval's clean scenario set the new wording lifted parallel-routing quality from 0.27 to 0.59 (deepseek-v4-flash, N=5/cell) with no regression to single, chain, or no-delegation routing.
- Added each teammate's configured default context mode as a `context` attribute on its `<member>` entry in the injected team prompt, so the calling agent picks context modes deliberately.
- Routed `team:delegate --improve` task refinement through the compaction-aware context path so compacted sessions feed complete history into the rewriter.

### Performance

- Added mtime-based caches to teammate config loading and teammate discovery so settings and teammate files are no longer re-read on every agent turn and delegate call; caches invalidate automatically when the underlying files change.
- Cached teammate discovery for the lifetime of the `/team:manage` overlay component instead of re-scanning the filesystem on every render frame.
- Replaced O(n²) `indexOf`-based deduplication with `Set`-based O(n) deduplication across string-list helpers.

### Fixed

- Reconciled the domain cleanup documentation with the remaining root-level command helper and removed context-transfer barrel.
- Fixed teammate discovery rejecting PascalCase names; teammate names may now use uppercase and lowercase letters, numbers, and hyphens.
- Fixed npm package contents omitting `skills/`, which prevented the packaged `recruiting-teammates` skill from being exposed on npm installs.
- Fixed `/team:manage` warning UX to show skipped-file reasons instead of only a count.
- Fixed collapsed parallel delegate rendering incorrectly showing running teammates as finished when live updates carried `status: running` with the initial `exitCode: 0`.
- Fixed builtin teammates being directly editable/deletable from `/team:manage`; they are now read-only until ejected.
- Fixed a variable-shadowing bug in the resume flow where the error path reported a stale job record, losing in-flight model and status updates.
- Fixed `summary`/`handoff` context generation silently dropping pre-compaction messages when a compaction marker's `firstKeptEntryId` was not found.
- Fixed the teammate manager validating edited project teammates with the wrong scope label.
- Replaced a full-file read used only for existence checks with a lightweight `access()` probe.

### Removed

- Removed unused resume-runner config plumbing left over from the modularization.
- Removed an unused delegate render constant left over from the rendering extraction.
- Removed the unused subprocess-based delegation helpers (`buildDelegateProcessPlan`, `copySessionFileToTemp`, `TEAMMATES_CURRENT_ENV`) superseded by the SDK-based `createAgentSession` flow.
