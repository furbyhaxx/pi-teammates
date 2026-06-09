# IDEAS

## Done

- `/team:delegate --agent <agent> [--improve] <task>` manual teammate delegation that keeps the user in the current session and feeds the invocation plus results back into the main session transcript.
- `/team:handoff --agent <agent> [--improve] <task>` manual teammate handoff that keeps the user in the current session and uses child `context=handoff` semantics.
- `--improve` task refinement using the current session model and current session context, followed by user review/edit before execution.
- `/team:manage` interactive teammate management UI for creating, editing, duplicating, and deleting teammate files.
- `/team:status` live overlay for current teammate activity and resumable teammate sessions.
- `/summarize [next task]` to create a new normal Pi session from a generated summary packet of the current session.
- `/handoff [next task]` to create a new normal Pi session from a generated handoff packet of the current session.
- Teammate frontmatter `skills[]` support, with automatic loading and prompt injection on each teammate invocation and persisted resume metadata.

## Open

> Add new ideas here
- Teammate definition watcher aka hot reload when changes are detected
- Explicit info injected into delegated agent's context or system prompt about the context and delgation mode, similar to how claude code does it (see https://github.com/Piebald-AI/claude-code-system-prompts.git)
