# IDEAS.md Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Implement all currently listed `IDEAS.md` features for `pi-teammates`, including child-session user commands, top-level handoff/summarize commands, teammate management/status UI, and teammate `skills[]` injection.

**Architecture:** Extend the existing internal-session `delegate` system instead of introducing a second execution path. Reuse current job/session persistence, context-transfer helpers, and Pi command/TUI APIs while adding user commands and teammate-skill injection in focused modules.

**Tech Stack:** TypeScript, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `@earendil-works/pi-tui`, `typebox`, `tsx`, Pi session/resource loader APIs.

---

### Task 1: Add teammate `skills[]` support

**Files:**
- Modify: `src/teammates.ts`
- Modify: `src/job-registry.ts`
- Modify: `src/index.ts`
- Modify: `tests/teammates.test.ts`
- Modify/Create: relevant example teammate files

**Steps:**
1. Write/extend failing tests for parsing `skills[]` frontmatter.
2. Add `skills: string[]` to teammate config and parsing.
3. Persist `skills[]` in teammate job records for resume flows.
4. Inject teammate skills into child sessions at startup.
5. Re-run focused tests.

### Task 2: Add child-session user commands

**Files:**
- Modify: `src/index.ts`
- Add or expand helpers inside `src/index.ts` unless extraction becomes clearly necessary
- Add tests for command parsing/behavior as feasible

**Steps:**
1. Add `/team:delegate --agent <agent> [--improve] <task>`.
2. Add `/team:handoff --agent <agent> [--improve] <task>` using child `context=handoff`.
3. Add task-improvement helper using current session context/model, then let the user edit/confirm before execution.
4. Feed invocation/result summaries back into the current session so the main agent sees the manual offload.
5. Keep returned child session ids resumable through `delegate`.

### Task 3: Add top-level transfer commands and UI

**Files:**
- Modify: `src/index.ts`
- Add helper modules if needed for readability
- Update tests/docs/examples

**Steps:**
1. Add `/summarize` to create a new normal Pi session from a generated summary packet.
2. Add `/handoff` to create a new normal Pi session from a generated handoff packet.
3. Add `/team:status` overlay using approved column-header layout and job/session data.
4. Add `/team:manage` interactive teammate manager with create/edit/delete flows and approved layout.
5. Verify command naming matches the clarified UX split: `/team:*` stays in current session, `/summarize` and `/handoff` create new sessions.

### Task 4: Sync docs, examples, and verify

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `examples/settings.jsonc`
- Modify: `examples/teammates/*.md`
- Add/modify tests as needed

**Steps:**
1. Document `skills[]`, new commands, `--improve`, and session semantics.
2. Keep examples aligned with new frontmatter and command behavior.
3. Run `npm test`.
4. Run `npm pack --dry-run`.
5. Request review after implementation.
