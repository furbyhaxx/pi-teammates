# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses conventional commits.

## [Unreleased]

### Added

- Added the `delegate` tool with single, parallel, and chained teammate execution.
- Added scoped teammate discovery from `${PI_CODING_AGENT_DIR}/teammates/**/*.md` and nearest ancestor `.pi/teammates/**/*.md` directories.
- Added `teammates` settings for project loading, parallelism limits, collapsed output count, output caps, and tool aliases.
- Added teammate frontmatter support for `tools` maps, `delegate`, `model`, and `prompt: append|replace`.
- Added recursion guards and dynamic teammate XML prompt injection.
- Added unit tests for config loading, teammate discovery, delegation policy, and process planning.
- Added example teammate definitions under `examples/teammates/`.
- Added a commented `examples/settings.jsonc` file documenting all extension config knobs, defaults, and value shapes.

### Changed

- Moved teammate delegation enablement into the teammate `tools` map as `tools.delegate` instead of a separate top-level frontmatter key.
