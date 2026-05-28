# pi-teammates

A [pi](https://github.com/earendil-works/pi) coding-agent extension for delegating bounded work to configured teammates running in isolated subprocesses.

It reworks Pi's subagent example into a settings-driven package with scoped teammate discovery, tool aliasing, prompt modes, context-transfer strategies, and recursion guards. Because just renaming `subagent` to `delegate` would have been insultingly lazy.

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
- Supports teammate frontmatter `context: new | inherit | summary | handoff` values.
- Supports teammate `prompt: append | replace` frontmatter.
- Supports configurable context-generation model lists with current-session-model fallback.
- Supports teammate `tools` maps with per-tool enable/disable rules and settings-defined aliases.
- Denies delegation by default inside child teammates unless `tools.delegate: true` is set.
- Blocks recursive delegation back into the current teammate lineage.
- Persists each delegate invocation into its own internal teammate session JSONL under the parent session directory.
- Returns teammate session ids so broken runs can be resumed through `delegate` itself.
- Appends a dynamic teammate XML block to the system prompt only when delegation is actually available.
- Makes the subagent example limits configurable through `settings.json`.

## Configuration

Configuration lives in Pi's normal scoped settings files under the `teammates` key:

- Global: `${PI_CODING_AGENT_DIR:-~/.pi/agent}/settings.json`
- Project: `./.pi/settings.json`

Project settings override global settings. The extension deep-merges only its own `teammates` block. Snake-case aliases such as `summary_models` and `handoff_models` are also accepted.

A fully commented example lives in [`examples/settings.jsonc`](examples/settings.jsonc).

### Defaults

```json
{
  "teammates": {
    "loadProjectTeammates": true,
    "maxParallelTasks": 8,
    "maxConcurrency": 4,
    "collapsedItemCount": 10,
    "perTaskOutputCap": 51200,
    "toolAliases": {},
    "context": {
      "models": [],
      "summaryModels": [],
      "handoffModels": []
    }
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
| `context.models` | `[]` | Preferred model list for generating `summary` or `handoff` context packets. Empty means use the current session model fallback immediately. |
| `context.summaryModels` | `[]` | Optional override list used only for `context: summary`. Falls back to `context.models` when empty. |
| `context.handoffModels` | `[]` | Optional override list used only for `context: handoff`. Falls back to `context.models` when empty. |

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

### Context model example

If you want dedicated models for context-packet generation, configure them explicitly:

```jsonc
{
  "teammates": {
    "context": {
      "models": ["deepseek/deepseek-v4-flash:high"],
      "summaryModels": ["deepseek/deepseek-v4-flash"],
      "handoffModels": ["deepseek/deepseek-v4-pro"]
    }
  }
}
```

If every configured candidate fails or has no working auth, pi falls back to the current session model as the last resort.

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
context: new
prompt: append
tools:
  read: true
  grep: true
  find: true
  ls: true
  write: false
  bash: true
  delegate: false
---
Inspect the repository quickly, stay scoped, and return only the findings that matter.
```

### Frontmatter fields

| Key | Required | Meaning |
| --- | --- | --- |
| `name` | yes | Unique teammate identifier used by the `delegate` tool. |
| `description` | yes | Short specialization summary used in the dynamic system prompt list. |
| `model` | no | Passed directly to `pi --model`, so `provider/model:thinking` works. |
| `context` | no | `new` (default), `inherit`, `summary`, or `handoff`. Controls the teammate's default context-transfer strategy. |
| `prompt` | no | `append` (default) appends the Markdown body to Pi's system prompt; `replace` replaces the base prompt with the Markdown body. |
| `tools` | no | Tool override map. This is also where `delegate` belongs. See semantics below. |

### `context` semantics

| Value | Meaning |
| --- | --- |
| `new` | Fresh context and only the delegated task. Default. |
| `inherit` | Continue from the caller's exact session context by cloning the invoking session. |
| `summary` | Fresh context plus a generated task-focused summary of the caller's session. |
| `handoff` | Fresh context plus a generated execution-oriented handoff packet for the specific next task. |

If `inherit` is requested from an ephemeral parent session with no backing session file, the call fails and should be retried with `new`, `summary`, or `handoff`.

### `tools` semantics

The `tools` map behaves like this:

- If the map is omitted, the teammate inherits the current active tool set.
- If the map contains at least one `true`, it behaves like an allowlist seeded from the `true` entries.
- If the map contains only `false` entries, it behaves like a hide list applied to the inherited active tools.
- `delegate` is still removed unless `tools.delegate: true` is set.
- Aliases from `teammates.toolAliases` are expanded before filtering.

This lets you express either narrow allowlists or small deltas against the current session tool set.

Example:

```yaml
tools:
  read: true
  grep: true
  find: true
  ls: true
  write: false
  edit: false
  bash: false
  delegate: false
```

## The `delegate` tool

The tool supports three modes:

### Single

```json
{
  "teammate": "scout",
  "context": "summary",
  "task": "Find the auth entry points and summarize the call graph."
}
```

### Resume a broken teammate session

```json
{
  "resumeSessionId": "child-session-id"
}
```

### Parallel

```json
{
  "tasks": [
    { "teammate": "scout", "task": "Find all auth providers." },
    { "teammate": "reviewer", "task": "List the highest-risk auth edge cases." }
  ],
  "context": "handoff"
}
```

### Chain

```json
{
  "chain": [
    { "teammate": "scout", "task": "Map the session flow." },
    { "teammate": "planner", "task": "Design the fix using this context:\n\n{previous}" }
  ],
  "context": "new"
}
```

Optional `cwd` is supported in single, parallel task items, and chain step items. Optional top-level `context` overrides every teammate's frontmatter default for that delegate call.

`resumeSessionId` is an alternative mode. Use the session id returned by a previous `delegate` call to reopen that persisted teammate session and continue its agent flow after something broke.

## Internal teammate sessions

Each delegate invocation now creates a real persisted child session stored under the parent session directory, conceptually like:

```text
~/.pi/agent/sessions/<sanitized-cwd>/<parent-session-id>/<child-session-file>.jsonl
```

These teammate sessions are intentionally internal-only and are not meant to clutter Pi's normal top-level session listing.

The parent session records teammate job metadata using Pi custom session entries so the extension can find and resume them later.

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
- Child teammates cannot delegate at all unless `tools.delegate: true` is set.
- When a child teammate can delegate, it still cannot delegate to itself or any teammate already present in its current delegation lineage.

That blocks obvious recursion loops without pretending the model will police itself.

## Example teammates

Example teammate definitions live in [`examples/teammates/`](examples/teammates/), and a commented settings example lives in [`examples/settings.jsonc`](examples/settings.jsonc).

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
