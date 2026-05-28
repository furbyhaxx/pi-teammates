# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses conventional commits.

## [Unreleased]

### Added

- Added the `delegate` tool with single, parallel, and chained teammate execution.
- Added scoped teammate discovery from `${PI_CODING_AGENT_DIR}/teammates/**/*.md` and nearest ancestor `.pi/teammates/**/*.md` directories.
- Added `teammates` settings for project loading, parallelism limits, collapsed output count, output caps, and tool aliases.
- Added teammate frontmatter support for `tools` maps, `delegate`, `model`, and `prompt: append|replace`.
- Added teammate context strategies with frontmatter `context: new|inherit|summary|handoff` plus a matching `delegate.context` override.
- Added configurable `teammates.context.models`, `summaryModels`, and `handoffModels` lists for context-packet generation, with current-session-model fallback.
- Added internal persisted teammate sessions plus custom-entry job records so delegate runs can be resumed by child session id.
- Added recursion guards and dynamic teammate XML prompt injection.
- Added unit tests for config loading, teammate discovery, delegation policy, process planning, context-transfer helpers, and teammate job registry state.
- Added example teammate definitions under `examples/teammates/`.
- Added a commented `examples/settings.jsonc` file documenting all extension config knobs, defaults, and value shapes.

### Changed

- Moved teammate delegation enablement into the teammate `tools` map as `tools.delegate` instead of a separate top-level frontmatter key.
- Updated all example teammate files to declare `prompt: append` explicitly so the prompt mode is documented in-place.
- Updated all example teammate files to declare `context: new` explicitly so the default context-transfer mode is shown in-place.
