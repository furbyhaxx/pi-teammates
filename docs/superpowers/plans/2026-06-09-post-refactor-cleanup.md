# pi-teammates Post-Refactor Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the surfaced post-refactor cleanup candidates by deduplicating delegate child-session runtime setup, extracting the remaining status command workflow, introducing shared command-context typing, and removing historical compatibility-barrel debt.

**Architecture:** Keep the current domain-first structure, but finish the cleanup by moving shared child-session runtime logic into a reusable delegate runtime helper, moving `team:status` into its own command module, introducing a shared internal command-context type, and converting internal code/tests from legacy root shim imports to direct domain paths. Root compatibility barrels that only exist for legacy structure should be removed.

**Tech Stack:** TypeScript 6, Node ESM with `.ts` imports, Pi extension APIs from `@earendil-works/pi-coding-agent`, TypeBox, `tsx`-driven tests, npm scripts.

---

## Safety Rules For This Cleanup Pass

- Preserve user-visible behavior even though import/API breakage is allowed.
- Do not change `delegate` tool semantics, prompt text, result details, session/job persistence, or status overlay behavior unless required to keep behavior after cleanup.
- Remove root compatibility barrels only after internal imports/tests have been updated.
- If shared child-session runtime extraction changes the shape of runner internals, keep all externally visible outputs identical.
- Add any newly discovered non-trivial follow-up work to `docs/design/refactor-follow-up-optimizations.md` instead of sneaking it into this pass.

## File Structure Direction For This Pass

After cleanup, internal code and tests should prefer these direct paths:

- `src/commands/*`
- `src/context/*`
- `src/config/*`
- `src/delegate/*`
- `src/jobs/*`
- `src/teammates/*`
- `src/ui/*`
- `src/shared/*`

Historical root shims such as `src/config.ts`, `src/context-transfer.ts`, `src/teammates.ts`, `src/job-registry.ts`, `src/manage-widget.ts`, `src/status-widget.ts`, `src/overlay-layout.ts`, `src/delegate-process.ts`, `src/delegation-policy.ts`, `src/teammate-skills.ts`, `src/teammate-state.ts`, and `src/builtin-teammates.ts` should be removed unless a strong structural reason remains.

---

### Task 1: Baseline and current import-surface audit

**Files:**
- Modify: none
- Read/inspect: `src/**/*.ts`, `tests/**/*.ts`, `docs/design/refactor-follow-up-optimizations.md`

- [ ] **Step 1: Verify the current cleanup branch is healthy**

Run:

```bash
cd /home/arnold/.pi/agent/custom-extensions/pi-teammates/.worktrees/refactor-domain-first-modularization
git status --short
npm test
```

Expected: clean working tree and passing tests.

- [ ] **Step 2: Record current file sizes and shim files**

Run:

```bash
find src -maxdepth 3 -type f -name '*.ts' | sort
find src -type f -name '*.ts' -print | sort | xargs wc -l | sort -nr | head -30
```

Expected: identify current root compatibility barrels and confirm no file is already oversized.

- [ ] **Step 3: Audit internal/test imports still using root shims**

Run:

```bash
rg -n "from \"\.\./src/|from '\.\./src/|from \"\./|from '\./" tests src -g '*.ts'
```

Expected: capture exactly which modules/tests still depend on legacy root paths.

- [ ] **Step 4: Commit only if this task requires a documentation note**

If no file changed, do not commit anything for Task 1.

---

### Task 2: Introduce shared command context typing and extract `team:status`

**Files:**
- Create: `src/commands/types.ts`
- Create: `src/commands/status.ts`
- Modify: `src/commands/manual-delegate.ts`
- Modify: `src/commands/session-transfer.ts`
- Modify: `src/extension/register-commands.ts`
- Test: `tests/command-helpers.test.ts`, `tests/delegate.test.ts`, `tests/delegate-rendering.test.ts`

- [ ] **Step 1: Create `src/commands/types.ts`**

Write:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type CommandContext = Parameters<
	NonNullable<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>
>[1];
```

- [ ] **Step 2: Replace repeated command-context inference**

Update these files to import and use `CommandContext` instead of repeating the long inferred type:

- `src/commands/manual-delegate.ts`
- `src/commands/session-transfer.ts`

The exported signatures should become structurally equivalent to:

```typescript
import type { CommandContext } from "./types.ts";

export async function runNewSessionTransfer(args: {
	ctx: CommandContext;
	mode: "summary" | "handoff";
	rawArgs: string;
}): Promise<void> {
	// existing body preserved
}
```

- [ ] **Step 3: Create `src/commands/status.ts`**

Move the `team:status` command workflow out of `src/extension/register-commands.ts` into:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { CommandContext } from "./types.ts";

export async function runStatusCommand(args: {
	pi: ExtensionAPI;
	ctx: CommandContext;
}): Promise<void> {
	// move existing team:status handler body here unchanged except import paths
}
```

Preserve:

- `showTeammateStatusOverlay(...)`
- `findTeammateJob(...)`
- `resumeTeammateSession(...)`
- transcript emission via `buildManualDelegationTranscript(...)`
- `ctx.ui.notify(...)` success/failure messages

- [ ] **Step 4: Simplify `src/extension/register-commands.ts`**

Change the `team:status` registration to:

```typescript
import { runStatusCommand } from "../commands/status.ts";

pi.registerCommand("team:status", {
	description: "Show a live overlay of teammate activity for the current session",
	handler: async (_args, ctx) => {
		await runStatusCommand({ pi, ctx });
	},
});
```

Do not change the command description string.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm run typecheck && tsx tests/command-helpers.test.ts && tsx tests/delegate.test.ts && tsx tests/delegate-rendering.test.ts
```

Expected: all pass unchanged.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/commands/types.ts src/commands/status.ts src/commands/manual-delegate.ts src/commands/session-transfer.ts src/extension/register-commands.ts
git commit -m "refactor(commands): extract status workflow"
```

---

### Task 3: Extract shared child-session runtime helper

**Files:**
- Create: `src/delegate/runtime.ts`
- Modify: `src/delegate/single-runner.ts`
- Modify: `src/delegate/resume-runner.ts`
- Test: `tests/delegate.test.ts`, `tests/context.test.ts`, `tests/jobs.test.ts`, `tests/delegate-rendering.test.ts`

- [ ] **Step 1: Create `src/delegate/runtime.ts`**

Extract the shared child-session setup/runtime logic used by both runners into a helper module. The exact final API can vary, but it should centralize:

- child `SettingsManager` creation
- base `DefaultResourceLoader` reload
- injected-skills prompt generation
- session `DefaultResourceLoader` setup
- `createAgentSession(...)`
- effective-model synchronization
- extension error binding
- snapshot synchronization
- subscription wiring for message/tool lifecycle events
- abort-listener setup/cleanup

A reasonable structure is:

```typescript
export interface ChildRuntimeSetupResult {
	sessionHandle: Awaited<ReturnType<typeof createAgentSession>>;
	syncSnapshot: () => void;
	cleanup: () => void;
	updateEffectiveModel: () => void;
}

export async function createChildRuntime(/* explicit args object */): Promise<ChildRuntimeSetupResult> {
	// shared logic moved from single-runner/resume-runner
}
```

- [ ] **Step 2: Refactor `src/delegate/single-runner.ts` to use the shared runtime helper**

Keep in `single-runner.ts` only the fresh-run-specific responsibilities:

- teammate lookup/validation
- recursion blocking
- context mode selection
- child session manager creation/forking
- teammate session state append
- job record creation
- generated context packet creation
- delegated task assembly
- waiting on `childSession.prompt(delegatedTask)` and final status mapping

- [ ] **Step 3: Refactor `src/delegate/resume-runner.ts` to use the shared runtime helper**

Keep in `resume-runner.ts` only the resume-specific responsibilities:

- opening the persisted session manager
- starting from stored job state
- marking job as running
- invoking `childSession.agent.continue()`
- final status mapping for resumed jobs

- [ ] **Step 4: Preserve all visible behavior**

Before leaving this task, manually compare key behaviors against the pre-refactor runners:

- missing teammate skill warnings
- effective child model tracking
- error propagation into `stderr`
- progress updates via `onUpdate`
- abort behavior
- job status transitions
- `session.dispose()` cleanup in `finally`

- [ ] **Step 5: Run focused verification**

Run:

```bash
npm run typecheck && tsx tests/delegate.test.ts && tsx tests/context.test.ts && tsx tests/jobs.test.ts && tsx tests/delegate-rendering.test.ts
```

Then run the stricter check:

```bash
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
```

Expected: both pass.

- [ ] **Step 6: Update optimization backlog if new runtime cleanup opportunities surface**

If additional non-trivial duplication remains after extraction, add it to:

- `docs/design/refactor-follow-up-optimizations.md`

Otherwise leave it unchanged.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/delegate/runtime.ts src/delegate/single-runner.ts src/delegate/resume-runner.ts docs/design/refactor-follow-up-optimizations.md
git commit -m "refactor(delegate): share child session runtime"
```

If the backlog doc did not change, omit it from `git add`.

---

### Task 4: Remove historical root compatibility barrels and switch imports to domain paths

**Files:**
- Modify: internal importers under `src/**`
- Modify: tests under `tests/**`
- Delete: root shim files that are no longer justified
- Test: all affected tests

Target deletions unless a strong reason emerges during implementation:

- `src/config.ts`
- `src/context-transfer.ts`
- `src/teammates.ts`
- `src/job-registry.ts`
- `src/manage-widget.ts`
- `src/status-widget.ts`
- `src/overlay-layout.ts`
- `src/delegate-process.ts`
- `src/delegation-policy.ts`
- `src/teammate-skills.ts`
- `src/teammate-state.ts`
- `src/builtin-teammates.ts`

- [ ] **Step 1: Update source imports to direct domain paths**

Rewrite internal imports so they no longer use root shims. Examples:

```typescript
// old
import { loadTeammatesConfig } from "../config.ts";

// new
import { loadTeammatesConfig } from "../config/load.ts";
```

```typescript
// old
import { buildInjectedSkillsPrompt } from "../teammate-skills.ts";

// new
import { buildInjectedSkillsPrompt } from "../teammates/skills.ts";
```

```typescript
// old
import { canDelegateToTeammate } from "../delegation-policy.ts";

// new
import { canDelegateToTeammate } from "../teammates/policy.ts";
```

Apply the same pattern across `src/`.

- [ ] **Step 2: Update tests to direct domain paths**

Rewrite test imports so they no longer depend on root shims. Expected shifts include:

- `tests/config.test.ts` → `../src/config/load.ts` and/or `../src/config/merge.ts`
- `tests/context.test.ts` → `../src/context/index.ts` or specific `../src/context/*.ts` modules
- `tests/teammates.test.ts` → `../src/teammates/index.ts`
- `tests/builtin-teammates.test.ts` → `../src/teammates/builtins.ts`
- `tests/jobs.test.ts` → `../src/jobs/index.ts` or specific job modules
- `tests/process.test.ts` → `../src/teammates/process.ts`
- `tests/teammate-state.test.ts` → `../src/teammates/state.ts`
- `tests/overlay-layout.test.ts` → `../src/ui/overlay-layout.ts`
- `tests/delegate.test.ts` policy import → `../src/teammates/policy.ts`

Keep `tests/delegate-rendering.test.ts` importing `../src/index.ts`, because the package entrypoint remains intentional.

- [ ] **Step 3: Delete the obsolete root shim files**

After source/tests no longer depend on them, remove the obsolete shim files:

```bash
rm src/config.ts src/context-transfer.ts src/teammates.ts src/job-registry.ts src/manage-widget.ts src/status-widget.ts src/overlay-layout.ts src/delegate-process.ts src/delegation-policy.ts src/teammate-skills.ts src/teammate-state.ts src/builtin-teammates.ts
```

Only keep a root shim if you can justify a real structural API reason in the final summary.

- [ ] **Step 4: Run broad verification**

Run:

```bash
npm test
```

Expected: full suite passes after import-path cleanup.

- [ ] **Step 5: Commit**

Run:

```bash
git add src tests
git rm src/config.ts src/context-transfer.ts src/teammates.ts src/job-registry.ts src/manage-widget.ts src/status-widget.ts src/overlay-layout.ts src/delegate-process.ts src/delegation-policy.ts src/teammate-skills.ts src/teammate-state.ts src/builtin-teammates.ts
git commit -m "refactor: remove legacy compatibility barrels"
```

If any listed file was intentionally retained, omit it from `git rm` and justify that choice in the commit summary and final report.

---

### Task 5: Update docs to reflect the direct domain import structure

**Files:**
- Modify: `docs/design/2026-06-09-domain-module-map.md`
- Modify: `docs/design/refactor-follow-up-optimizations.md` (only if needed)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update the module map**

Revise `docs/design/2026-06-09-domain-module-map.md` so it no longer describes the removed compatibility barrels as the standard internal surface.

Add an explicit note that internal code/tests now import direct domain modules and that historical root shims were removed during the cleanup pass.

- [ ] **Step 2: Update the changelog**

Under `[Unreleased] -> Changed`, add:

```markdown
- Resolved the post-refactor cleanup pass by sharing delegate child-session runtime setup, extracting the remaining `team:status` workflow, introducing shared command-context typing, and removing legacy compatibility barrels in favor of direct domain imports.
```

- [ ] **Step 3: Update optimization backlog only if needed**

If the shared child-session helper was fully resolved and no meaningful residual action remains, either:

- remove that backlog item, or
- rewrite it to reflect any narrower remaining follow-up.

Do not leave stale backlog text claiming unresolved duplication if it was actually addressed.

- [ ] **Step 4: Commit**

Run:

```bash
git add CHANGELOG.md docs/design/2026-06-09-domain-module-map.md docs/design/refactor-follow-up-optimizations.md
git commit -m "docs: update cleanup pass documentation"
```

---

### Task 6: Final verification and summary

**Files:**
- Modify: none unless verification reveals a real missed import or doc typo

- [ ] **Step 1: Run line-count check**

Run:

```bash
find src -type f -name '*.ts' -print | sort | xargs wc -l | sort -nr | head -30
```

Expected: no production file above 500 SLoC.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected: pass.

- [ ] **Step 3: Run package dry-run**

Run:

```bash
npm pack --dry-run
```

Expected: package still includes intended shipped files only.

- [ ] **Step 4: Inspect final branch state**

Run:

```bash
git status --short
git log --oneline --decorate -12
```

Expected: clean working tree and recent commits corresponding to cleanup tasks.

- [ ] **Step 5: Final summary**

Report in this format:

```text
Cleanup summary:
- Shared delegate runtime: [implemented / not implemented, with note]
- Status command extraction: [implemented / not implemented]
- Shared command context typing: [implemented / not implemented]
- Compatibility barrels removed: [list]
- Remaining intentional root surfaces: [list]
- Validation: npm test passed; npm pack --dry-run passed.
- Largest remaining files: [top results]
- Residual optimization backlog items: [count and titles]
```

Do not claim live delegate resume/recovery works unless it was validated beyond the existing automated tests.
