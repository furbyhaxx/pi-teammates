# Teammate Recruiting and Profile Design Capture

**Status:** initial design capture

## Implementation status

- Status: draft
- Target milestone: next
- Owner surface: skill, command, docs, tests

## Finalized scope

Not finalized for implementation yet. The likely first pass is updating `skills/recruiting-teammates/SKILL.md` with a profile quality contract after delegation prompt/output policy is finalized.

## Deferred scope

- **[trp-1] Assisted `/team:manage` recruiting flow**
  - Reason: waiting for UX validation; skill-driven recruiting already exists.
  - Depends on: deciding whether interactive profile creation belongs in the manager UI.
  - Revisit when: users need guided teammate creation without invoking the skill manually.
  - Candidate surface: command, UI.
- **[trp-2] Mandatory validation delegate before saving**
  - Reason: risky/slow for basic profile editing and may surprise users.
  - Depends on: defining a safe, cheap smoke-test workflow.
  - Revisit when: profile quality checks are implemented and users request stronger validation.
  - Candidate surface: command, tool, tests.
- **[trp-3] Structured completion footers in builtins**
  - Reason: dependency-blocked by structured completion-state design.
  - Depends on: `context-steering-and-state` completion format decision.
  - Revisit when: completion parser/classifier work starts.
  - Candidate surface: docs, internal mechanic.

## What we are designing

An improved teammate creation/recruiting workflow that produces high-quality teammate profiles with clear triggers, boundaries, tool rationale, context defaults, and validation steps.

## Data and sources

- Local pi-teammates:
  - `skills/recruiting-teammates/SKILL.md` guides teammate creation.
  - `src/teammates.ts` parses `name`, `description`, `model`, `context`, `prompt`, `skills`, and `tools` frontmatter.
  - `examples/teammates/*.md` now contain builtin fallback profiles.
  - `/team:manage` supports creating/editing/duplicating teammate files.
- Claude Code extracted prompts:
  - `system-prompts/agent-prompt-agent-creation-architect.md`: extract intent, design expert persona, architecture instructions, optimize performance, create identifier, emit when-to-use description.
  - `system-prompts/system-prompt-writing-subagent-prompts.md`: fresh agents need self-contained context and purpose.
  - `system-prompts/agent-prompt-worker-fork.md`: worker prompt should execute one directive and stop; workers should not recursively spawn agents by default.
- Prompt/tool design guidance from loaded skills:
  - Tool access should be narrowed by task.
  - Agent prompts should be operating policy, not just persona.

## Candidate profile quality contract

A teammate profile should include:

1. **Name** — letters, numbers, and hyphens; PascalCase and slug names allowed.
2. **Description** — triggerable, concrete “use when...” style summary.
3. **When not to use** — avoid overlap and misrouting.
4. **Role** — optimization lens, not generic persona.
5. **Task policy** — what work the teammate owns.
6. **Boundaries** — what it must not do.
7. **Tool rationale** — why each enabled risky tool is needed.
8. **Context mode rationale** — why `new`, `inherit`, `summary`, or `handoff` is default.
9. **Output contract** — expected summary/evidence/next action shape.
10. **Validation delegate** — a small trial task proving the teammate triggers and behaves correctly.

## Recruiting skill improvements

Update `skills/recruiting-teammates/SKILL.md` to require:

- requirements interview,
- trigger examples,
- negative trigger examples,
- tool permission rationale,
- context mode selection rationale,
- self-contained system prompt body,
- test delegation and review loop,
- optional builtin/eject guidance.

## `/team:manage` opportunities

Potential future manager enhancements:

- Profile quality checklist.
- Warning when descriptions are vague or overlapping.
- Preview of generated `<member>` prompt entry.
- Copy/eject builtin profile as a starting point.
- Show whether `delegate` is enabled and warn about recursive delegation risk.

## Open decisions

1. Should recruiting output prefer PascalCase names to match builtins, lowercase slugs, or user choice?
2. Should `/team:manage` include an assisted “create from interview” flow, or should recruiting remain skill-driven?
3. Should profile validation require an actual `delegate` smoke test before saving?
4. Should builtin teammates include explicit structured completion footers once that mechanic is designed?
