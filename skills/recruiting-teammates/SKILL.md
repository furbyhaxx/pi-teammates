---
name: recruiting-teammates
description: Use when a user requests a new Pi teammate for a specific specialization, or when you (the agent) identify that the current teammate roster lacks adequate coverage for a recurring workflow need. Also use when significantly reworking an existing teammate's scope, system prompt, tool set, or model assignment.
---

# Recruiting Teammates

## Overview

Teammates are persistent specialized agents in the pi-teammates system. Recruiting one makes sense for **recurring needs** — not one-off tasks. A well-recruited teammate has tight constraints on what it does AND what it does not do.

This skill covers two paths:

- **Mode 1 — User-requested**: the user asks for a new teammate. Run an interactive requirements interview, design the spec together, validate through test delegations.
- **Mode 2 — Agent-autonomous**: you identify that no current teammate adequately covers a recurring need. Design the spec, get user approval (by default), write the file to project scope.

After creating a teammate, always validate it through at least two live test delegations before treating it as production-ready.

---

## When Is Recruiting Warranted?

Recruit when:
- The user explicitly asks for a new teammate or specialist
- A recurring pattern exists that no current teammate handles
- You repeatedly delegate to teammates that partially fit but require workarounds
- A task requires persistent, opinionated specialization not present in the roster

**Do not recruit for:**
- One-off tasks — use the closest existing teammate instead
- Tasks an existing teammate handles adequately with a better task description
- Hypothetical future needs

Check existing teammates first before designing anything new:

```bash
ls .pi/teammates/ ~/.pi/agent/teammates/ 2>/dev/null
```

If an existing teammate could be tuned rather than replaced, propose that — extending beats creating from scratch.

---

## Mode 1: User-Requested Recruitment

### Requirements Interview

Ask these questions **one at a time**, using `AskUserQuestion` when available. Prefer multiple-choice options where applicable. Build the spec from the answers.

**Q1 — Role** *(required)*
What is the primary specialization? What job title fits? ("Security auditor", "Database migration specialist", "API doc writer", etc.)

**Q2 — Core tasks**
What are 2–3 concrete examples of tasks you'd delegate to them? Specific beats vague: "review this function for SQL injection risks" beats "security stuff".

**Q3 — Hard constraints**
What must they explicitly NOT do? (e.g., "never modify files", "never make API calls", "do not suggest architectural rewrites"). Constraints are as important as capabilities — a teammate without them will drift.

**Q4 — Tool access**
Which tools do they need? Think from the job, not the tool list. Common patterns:

| Teammate type | Tools to enable |
|---|---|
| Investigator / recon | `read`, `grep`, `find`, `ls` |
| Researcher | above + `web_search`, `web_fetch`, `web_repo_clone` |
| Planner / analyst | investigator tools + `bash` (verification), `plan_tracker` |
| Implementer | planner tools + `write`, `edit` |
| Reviewer / auditor | investigator tools + `bash` (validation commands) |
| Orchestrator | add `delegate: true` to any of the above |

**Q5 — Pi skills to inject**
Which existing Pi skills should auto-load into each invocation?

- `online-research` — needs current external facts
- `systematic-debugging` — bug investigation work
- `test-driven-development` — implementation tasks
- `verification-before-completion` — quality-sensitive output
- `writing-plans` — produces implementation plans

Leave empty if the system prompt already encodes the workflow.

**Q6 — Context mode**
How should they receive their working context?

| Mode | When |
|---|---|
| `new` | Independent tasks, no session history needed. **Default.** |
| `handoff` | One specific next step, teammate needs targeted context |
| `summary` | Continuation tasks where broader session background helps |
| `inherit` | Exact transcript clone (rare — prefer `handoff`) |

**Q7 — Model**
Leave blank to inherit the session default, or specify by role:

| Task complexity | Suggested tier |
|---|---|
| Cheap recon, structural queries | `deepseek/deepseek-v4-flash` |
| Balanced investigation | `deepseek/deepseek-v4-flash:high` |
| Complex planning or reasoning | `anthropic/claude-opus-4-7:medium` |
| High-quality implementation | `openai-codex/gpt-5.5:xhigh` |

Do not over-allocate. A recon teammate on a heavy reasoning model wastes budget on every delegation.

**Q8 — Output format**
What does a perfect output from this teammate look like? Describe the sections, format, length, and tone. This becomes the "Output Format" section of the system prompt.

**Q9 — Scope** *(user-requested path)*
Project scope (`.pi/teammates/`) for this repo's specialists, or user scope (`$PI_CODING_AGENT_DIR/teammates/`, default `~/.pi/agent/teammates/`) for personal reusable teammates?

---

## Mode 2: Agent-Autonomous Recruitment

When you identify the need without the user asking:

1. Confirm the need is recurring — one-off tasks don't warrant a new teammate.
2. Check the existing roster to ensure no current teammate fits with minor adjustments.
3. Draft the teammate spec (see "Designing the Spec" below).
4. **By default, present the full draft to the user for approval before writing.** Say something like: "I think this task warrants a dedicated teammate. Here's the spec — does this look right?" If the user explicitly instructed autonomous operation ("go ahead", "create it", "don't ask"), skip the review step.
5. Write to project scope (`.pi/teammates/`) unless the user specifies otherwise.

---

## Designing the Teammate Spec

### System Prompt Template

Every teammate's system prompt body should follow this structure:

```markdown
# Role
One sentence: who is this teammate and what domain do they own.

# Task
What they are being asked to do in this delegation.

# Constraints
- What they must never do (explicit actions, tools, scope)
- What is out of scope
- Stop-and-report rules: "if X is unclear, stop and report the gap instead of guessing"

# Working Method
1. Start with cheap structural queries (ls, find, grep) before deep reads
2. Read only the most relevant files or sections
3. [Specific steps for this role]
4. Stop when you can answer the scoped question confidently

# Output Format
Return Markdown with these sections:
## [Section 1]
## [Section 2]
...
```

Keep "Role" to one sentence — it grounds the model without polluting the context. The "Constraints" section matters most: without explicit restrictions, teammates drift into adjacent scope.

### Tool Frontmatter Semantics

The `tools` map uses an **allowlist** when at least one entry is `true`, or a **denylist** when all entries are `false`. Prefer the allowlist pattern — it forces explicit thinking about what the teammate actually needs.

```yaml
# Allowlist (recommended) — only listed true tools are available
tools:
  read: true
  grep: true
  find: true
  ls: true
  delegate: false   # explicitly block sub-delegation

# Denylist — all session tools available except listed false ones
tools:
  write: false
  edit: false
```

Always explicitly include `delegate: false` unless sub-delegation was deliberately designed in.

### The Description Field

The teammate's `description` appears in the delegation system prompt that the calling agent reads when deciding who to delegate to. Make it precise and specific — it is the teammate's "job posting" in the team roster.

Good description: `"Audits code changes for security regressions, SQL injection, and auth bypass risks. Returns severity-ranked findings with evidence, not fixes."`

Bad description: `"Does security stuff and code review."`

Keep it one sentence. Do not summarize the workflow — describe the specialization.

### Name Validation

The `name` field must match: letters, numbers, and hyphens only. PascalCase names such as `IssueAnalyst` and lowercase slugs such as `issue-analyst` are both valid. No leading, trailing, or consecutive hyphens. Must be unique across the discovered roster.

---

## Writing the Teammate File

Determine the path:
- Project scope: `.pi/teammates/{name}.md`
- User scope: `$PI_CODING_AGENT_DIR/teammates/{name}.md` (or `~/.pi/agent/teammates/{name}.md`)

Create the file with the `write` tool. Full format:

```markdown
---
name: {name}
description: {precise one-sentence specialization}
model: {provider/model:thinking — or leave blank for session default}
context: {new|handoff|summary|inherit}
prompt: append
skills:
  - {skill-name}
tools:
  read: true
  grep: true
  find: true
  ls: true
  bash: {true|false}
  write: {true|false}
  edit: {true|false}
  web_search: {true|false}
  web_fetch: {true|false}
  delegate: false
---
# Role
...

# Task
...

# Constraints
...

# Working Method
...

# Output Format
...
```

The teammate is discoverable immediately after writing — no session restart required.

---

## Validation Loop

After writing the file, run a test delegation cycle **in the current session** (you are the team lead).

### Step 1 — Design test tasks

Create 2–3 tasks covering the teammate's scope:
- A clear "happy path" task well within scope
- A task at the edge of scope (should succeed, output may be leaner)
- A task slightly outside scope (they should stay in lane and report the gap rather than attempting it)

### Step 2 — Run test delegations

```
delegate({
  teammate: "{name}",
  task: "{test task}",
  context: "new"
})
```

Run each task. Observe tool usage, output format, scope discipline, and constraint adherence.

### Step 3 — Evaluate each result

For each delegation, assess:

| Check | What to look for |
|---|---|
| Role compliance | Did they stay within defined scope? |
| Constraint adherence | Did they avoid forbidden tools and actions? |
| Output structure | Does the output match the specified format sections? |
| Task completion | Did they actually answer the delegated question? |
| Tool efficiency | Did they use cheap queries before expensive reads? |

### Step 4 — Iterate

If any test fails the evaluation, identify root cause and fix the teammate spec:

| Problem | Likely fix |
|---|---|
| Drifts outside scope | Tighten the Constraints section |
| Output format inconsistent | Add explicit section headers to Output Format |
| Uses wrong/forbidden tools | Tighten the tools allowlist |
| Too verbose or too terse | Add explicit detail/length guidance |
| Wrong approach | Revise or add steps in Working Method |
| Needs more context | Change context mode from `new` to `handoff` or `summary` |

Edit the file and re-run the failing tasks. Repeat until all three tests produce acceptable output.

### Step 5 — Final checklist

- [ ] Name unique, valid format (letters, numbers, and hyphens only; PascalCase is allowed)
- [ ] Description is one precise specialization sentence
- [ ] `delegate: false` set (unless sub-delegation was intentional)
- [ ] Tools use allowlist pattern (at least one `true`) unless denylist was deliberate
- [ ] System prompt has all five sections: Role, Task, Constraints, Working Method, Output Format
- [ ] All 2–3 test tasks produce acceptable output
- [ ] User confirmed the result (or approved autonomously)

---

## Common Mistakes

**Over-scoping** — "Do everything" teammates dilute the value of delegation. Each teammate should do one thing well. For multi-specialization tasks, chain existing teammates rather than creating an omnibus one.

**Missing constraints** — A teammate without explicit "must not" rules will interpret tasks broadly and drift. Always define what they will not do.

**`delegate: true` by default** — Sub-delegation creates delegation chains and recursion risks. Only enable it when the teammate role explicitly requires spawning its own sub-teammates.

**Wrong context mode** — `new` is the right default. Using `inherit` copies the entire session transcript into every child run. That inflates token usage on every delegation for no benefit unless the teammate truly needs the exact conversation history.

**Skipping validation** — A teammate spec that looks good on paper often fails on real tasks. Always run at least two test delegations before treating it as production-ready.

**Cloning a `true`-everything tools map** — If you omit the tools map entirely, the teammate inherits the full active session tool set. That's rarely what you want. Be explicit.
