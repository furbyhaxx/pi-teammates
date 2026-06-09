# Delegate TUI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement tree-style collapsed/live rendering for `delegate` single, parallel, and chain modes.

**Architecture:** Keep the delegate tool schema and result details stable. Reduce `renderCall()` to title-only output, and add focused rendering helpers inside `src/index.ts` for goal previews, teammate headers, tool-call tree rows, completion rows, and aggregate status lines.

**Tech Stack:** TypeScript 6, Pi extension `renderCall`/`renderResult`, `@earendil-works/pi-tui` `Text`/`Container`/`Markdown`, Node `tsx` tests.

---

### Task 1: Add failing renderer tests

**Files:**
- Modify: `tests/delegate-rendering.test.ts`

- [ ] Add test cases for single running, single completed, parallel running, parallel completed, and leading `Goal:` cleanup using the registered `delegate.renderResult()` renderer.
- [ ] Run: `npm run test:unit -- --ignored` is not applicable for this package; instead run `npx tsx tests/delegate-rendering.test.ts`.
- [ ] Expected before implementation: assertions fail because current rendering duplicates call previews, omits persistent goal lines in parallel/single rows, and includes collapsed final output previews for single completed results.

### Task 2: Implement collapsed tree rendering helpers

**Files:**
- Modify: `src/index.ts`

- [ ] Add helpers near existing rendering utilities:
  - `stripGoalPrefix(task: string): string`
  - `formatGoalLine(task: string): string`
  - `formatResultHeader(result: SingleResult, label?: string): string`
  - `formatRunningToolLines(...)`
  - `formatResultStatusLine(result: SingleResult): string`
- [ ] Keep all helpers local to `src/index.ts`; do not alter `DelegateDetails` or `SingleResult` shapes.

### Task 3: Simplify `renderCall()`

**Files:**
- Modify: `src/index.ts`

- [ ] Remove per-task preview lines from `renderCall()`.
- [ ] Preserve titles: `Delegate(resume ...)`, `Delegate(chain · N steps)`, `Delegate(N tasks)`, `Delegate(Teammate)` and optional context suffix.

### Task 4: Rework single collapsed rendering

**Files:**
- Modify: `src/index.ts`

- [ ] Running single output should be rooted by `⎿ Teammate · usage`, include `Goal:`, hidden tool count, latest tool calls, and `Running…`.
- [ ] Completed single output should include `Goal:` and `Done ✓` or `Error ✗`, but no final markdown preview in collapsed mode.
- [ ] Expanded single output remains full-detail.

### Task 5: Rework parallel collapsed rendering

**Files:**
- Modify: `src/index.ts`

- [ ] Running header should be `⎿ parallel X/N done · R running`.
- [ ] Completed header should be `⎿ parallel N/N teammates finished ✓` or include failure count when needed.
- [ ] Each teammate row should include usage/model when known, `Goal:`, latest running tool call or final `Done ✓`/`Error ✗`.
- [ ] Total usage remains below completed parallel output.

### Task 6: Rework chain collapsed rendering

**Files:**
- Modify: `src/index.ts`

- [ ] Running header should include current running step when any step is running.
- [ ] Each completed/running chain result should render `Step N: Teammate · usage`, `Goal:`, and status/tool rows.
- [ ] Avoid guessing not-yet-started steps unless available in results.

### Task 7: Verify and document

**Files:**
- Modify: `CHANGELOG.md`

- [ ] Add/keep changelog entry for implemented renderer polish.
- [ ] Run `npx tsx tests/delegate-rendering.test.ts`.
- [ ] Run `npm test`.
- [ ] Expected: typecheck and all unit tests pass.
