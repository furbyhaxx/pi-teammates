# pi-teammates Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Build a standalone `pi-teammates` extension package that reworks Pi's subagent example into a configurable teammate delegation system.

**Architecture:** The package stays source-only under `src/` and splits into config loading, teammate discovery, prompt/tool policy helpers, and the extension entry point. The `delegate` tool keeps the example's subprocess-based execution model, while settings-driven teammate discovery, prompt injection, tool aliasing, and recursion guards are added around it.

**Tech Stack:** TypeScript, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `@earendil-works/pi-tui`, `typebox`, `tsx`, `node:assert`.

---

### Task 1: Lock down config and teammate parsing with tests

**Files:**
- Create: `tests/config.test.ts`
- Create: `tests/teammates.test.ts`
- Create: `src/config.ts`
- Create: `src/teammates.ts`

**Step 1:** Write failing tests for settings defaults, scoped settings merge, tool aliases, teammate frontmatter parsing, recursive `.pi/teammates/**/*.md` loading, and project-overrides-user precedence.

**Step 2:** Run the tests to confirm they fail for the missing modules.

**Step 3:** Implement minimal config and teammate discovery code to satisfy the tests.

**Step 4:** Re-run the focused tests until they pass.

### Task 2: Lock down delegation policy helpers with tests

**Files:**
- Create: `tests/delegate.test.ts`
- Create: `src/delegation-policy.ts`

**Step 1:** Write failing tests for tool resolution semantics, alias expansion, delegate default-deny behavior, lineage/self-recursion blocking, and dynamic teammate XML prompt generation.

**Step 2:** Run the tests to confirm they fail.

**Step 3:** Implement the pure policy helpers until the tests pass.

**Step 4:** Re-run the focused tests until they pass cleanly.

### Task 3: Implement the extension entry point and subprocess delegate tool

**Files:**
- Create: `src/index.ts`

**Step 1:** Port the subagent example into `delegate`, rebrand UI/details to teammate terminology, and wire settings-driven limits.

**Step 2:** Replace `agentScope` / `confirmProjectAgents` handling with config-driven project teammate loading.

**Step 3:** Apply teammate prompt mode (`append` vs `replace`), tool resolution, lineage env propagation, and runtime recursion guard checks.

**Step 4:** Inject the dynamic teammate XML block into the session system prompt only when delegation is actually available.

### Task 4: Finish package docs and samples

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Optionally create: `examples/teammates/*.md`

**Step 1:** Document install, config defaults, aliasing, teammate frontmatter, prompt modes, and recursion rules.

**Step 2:** Add practical examples for `settings.json` and teammate markdown files.

**Step 3:** Update changelog entries for the new feature set.

### Task 5: Verify, package, and commit

**Files:**
- Modify: repo root as needed

**Step 1:** Run `npm run typecheck`.

**Step 2:** Run `npm test`.

**Step 3:** Run `npm pack --dry-run`.

**Step 4:** Review `git status` and ensure only intended files are tracked.

**Step 5:** Commit with a conventional message describing what was added.
