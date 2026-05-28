# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses conventional commits.

## [Unreleased]

### Added

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

- Moved teammate delegation enablement into the teammate `tools` map as `tools.delegate` instead of a separate top-level frontmatter key.
- Updated all example teammate files to declare `prompt: append` explicitly so the prompt mode is documented in-place.
- Updated all example teammate files to declare `context: new` explicitly so the default context-transfer mode is shown in-place.
- Updated example teammate profiles to demonstrate non-empty `skills` lists.
- Reworked the bundled teammate profiles into stricter operating-policy prompts with sharper descriptions, aligned skills, narrower tool intent, and allowed-model selections.
