# pi-teammates

A [pi](https://github.com/earendil-works/pi) coding-agent extension for delegating bounded work to configured teammates running in isolated subprocesses.

It reworks Pi's subagent example into a settings-driven package with scoped teammate discovery, tool aliasing, prompt modes, and recursion guards. Because just renaming `subagent` to `delegate` would have been insultingly lazy.

## Install

From GitHub:

```sh
pi install git:https://github.com/furbyhaxx/pi-teammates
```

From a local checkout:

```sh
git clone https://github.com/furbyhaxx/pi-teammates
cd pi-teammates
npm install
pi install path/to/cloned/repo
```

Load directly without installing:

```sh
pi -e path/to/cloned/repo
```

After npm publishing, the package is intended to install as:

```sh
pi install npm:@furbyhaxx/pi-teammates
```

## Features

- Adds a `delegate` tool for single, parallel, and chained teammate execution.
- Discovers teammates from user and project scopes.
- Loads project teammates by default and lets settings disable them globally or per project.
- Supports teammate frontmatter `model: provider/model:thinking` values directly.
- Supports teammate `prompt: append | replace` frontmatter.
- Supports teammate `tools` maps with per-tool enable/disable rules and settings-defined aliases.
- Denies delegation by default inside child teammates unless `delegate: true` is set.
- Blocks recursive delegation back into the current teammate lineage.
- Appends a dynamic teammate XML block to the system prompt only when delegation is actually available.
- Makes the subagent example limits configurable through `settings.json`.

## Configuration

Configuration lives in Pi's normal scoped settings files under the `teammates` key:

- Global: `${PI_CODING_AGENT_DIR:-~/.pi/agent}/settings.json`
- Project: `./.pi/settings.json`

Project settings override global settings. The extension deep-merges only its own `teammates` block.

### Defaults

```json
{
  "teammates": {
    "loadProjectTeammates": true,
    "maxParallelTasks": 8,
    "maxConcurrency": 4,
    "collapsedItemCount": 10,
    "perTaskOutputCap": 51200,
    "toolAliases": {}
  }
}
```

### Settings

| Key | Default | Meaning |
| --- | --- | --- |
| `loadProjectTeammates` | `true` | Load nearest ancestor `.pi/teammates/**/*.md` definitions in addition to user-scoped teammates. |
| `maxParallelTasks` | `8` | Hard cap for one `delegate` parallel call. |
| `maxConcurrency` | `4` | Worker concurrency used for parallel delegation. |
| `collapsedItemCount` | `10` | Number of recent display items shown in collapsed tool output. |
| `perTaskOutputCap` | `51200` | Max model-visible bytes kept per parallel task summary. Full data still stays in tool details. |
| `toolAliases` | `{}` | Map of teammate tool names to actual Pi tool names. |

### Tool alias example

If your environment replaces `bash` with `shell_exec`, add an alias:

```json
{
  "teammates": {
    "toolAliases": {
      "bash": ["shell_exec"]
    }
  }
}
```

Alias arrays are resolved in addition to the original key, then filtered against the current active tool set.

## Teammate discovery

User teammates are loaded recursively from:

```text
${PI_CODING_AGENT_DIR:-~/.pi/agent}/teammates/**/*.md
```

Project teammates are loaded recursively from the nearest ancestor directory containing:

```text
.pi/teammates/**/*.md
```

Project teammates override user teammates with the same `name`.

## Teammate frontmatter

Teammates are Markdown files with YAML frontmatter:

```md
---
name: scout
description: Fast codebase reconnaissance and scoped file discovery.
model: deepseek/deepseek-v4-flash:high
delegate: false
prompt: append
tools:
  read: true
  grep: true
  find: true
  ls: true
  write: false
  bash: true
---
Inspect the repository quickly, stay scoped, and return only the findings that matter.
```

### Frontmatter fields

| Key | Required | Meaning |
| --- | --- | --- |
| `name` | yes | Unique teammate identifier used by the `delegate` tool. |
| `description` | yes | Short specialization summary used in the dynamic system prompt list. |
| `model` | no | Passed directly to `pi --model`, so `provider/model:thinking` works. |
| `delegate` | no | Defaults to `false`. When `true`, the child teammate may call `delegate` unless blocked by lineage recursion rules. |
| `prompt` | no | `append` (default) appends the Markdown body to Pi's system prompt; `replace` replaces the base prompt with the Markdown body. |
| `tools` | no | Tool override map. See semantics below. |

### `tools` semantics

The `tools` map behaves like this:

- If the map is omitted, the teammate inherits the current active tool set.
- If the map contains at least one `true`, it behaves like an allowlist seeded from the `true` entries.
- If the map contains only `false` entries, it behaves like a hide list applied to the inherited active tools.
- `delegate` is still removed unless `delegate: true` is set.
- Aliases from `teammates.toolAliases` are expanded before filtering.

This lets you express either narrow allowlists or small deltas against the current session tool set.

## The `delegate` tool

The tool supports three modes:

### Single

```json
{
  "teammate": "scout",
  "task": "Find the auth entry points and summarize the call graph."
}
```

### Parallel

```json
{
  "tasks": [
    { "teammate": "scout", "task": "Find all auth providers." },
    { "teammate": "reviewer", "task": "List the highest-risk auth edge cases." }
  ]
}
```

### Chain

```json
{
  "chain": [
    { "teammate": "scout", "task": "Map the session flow." },
    { "teammate": "planner", "task": "Design the fix using this context:\n\n{previous}" }
  ]
}
```

Optional `cwd` is supported in single, parallel task items, and chain step items.

## Delegation prompt behavior

When `delegate` is active for the current session, the extension appends a dynamic block like this to the system prompt:

```xml
Below is a list of your teammates with their specializations, capabilities and domains. Use this information to delegate narrow, concrete work that benefits from a fresh context window or teammate-specific tools, prompts, or model settings. Delegate execution, not judgment: decide what needs to be done, pass the relevant files and constraints, and ask for the exact output you want back.
<team>
<member name="scout">Fast codebase reconnaissance and scoped file discovery.</member>
</team>
```

Only teammates that are actually valid delegation targets for the current lineage are listed.

## Recursion rules

- Top-level sessions may delegate freely.
- Child teammates cannot delegate at all unless `delegate: true` is set.
- When a child teammate can delegate, it still cannot delegate to itself or any teammate already present in its current delegation lineage.

That blocks obvious recursion loops without pretending the model will police itself.

## Example teammates

Example teammate definitions live in [`examples/teammates/`](examples/teammates/).

## Package manifest

The Pi package manifest exposes only the extension entry point:

```json
{
  "pi": {
    "extensions": ["./src/index.ts"]
  }
}
```

## Development

```sh
npm install
npm run typecheck
npm test
npm pack --dry-run
```

Pi loads the TypeScript source directly; the build script only typechecks and does not emit artifacts.
