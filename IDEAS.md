

- `/team:delegate --agent <agent> [--improve] <task>` and `/handoff --agent <agent> [--improve] <task>` user commands that allow ad-hoc delegation/handoff of scoped tasks into by the user where when it's done we feed back the invocation + results to the main session so the agent is aware that this happened.  `--improve` can be used to let the current session model enhance/improve <task> based on the current session context which would show the generated and improved <task> to the user for editing and confirmation, this is the same when context = summary|handoff.
- `/team:manage` user command that shows a polished, interactive widget that lists all agents, allows chaging them or creating new ones
- add `/team:summarize` and `/team:handoff` user commands that create a new session from either summarizing or handing off the current one into a new one (not subagent, normal pi session).
- add a `/team:status` user command that shows a real time overlay with what is going on currently
- Extend teammate frontmatter with a `skills[]` field that allows listing skills that are automatically loaded and injected on each invocation of this teammate