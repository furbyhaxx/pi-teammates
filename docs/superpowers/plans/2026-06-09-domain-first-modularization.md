# pi-teammates Domain-First Modularization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the `pi-teammates` production TypeScript into focused domain modules while preserving every public behavior and persisted data shape.

**Architecture:** Keep `src/index.ts` as the Pi package entrypoint and make it a thin extension factory. Move code mechanically into domain folders (`delegate/`, `commands/`, `extension/`, `context/`, `config/`, `teammates/`, `jobs/`, `ui/`, `shared/`) with compatibility barrel files at old import paths where tests or existing modules currently import root files.

**Tech Stack:** TypeScript 6, Node ESM with `.ts` imports, Pi extension APIs from `@earendil-works/pi-coding-agent`, Typebox schemas, Node test scripts through `tsx`, npm scripts.

---

## Safety Rules For The Whole Plan

- Preserve behavior. Do not intentionally change tool schemas, command names, prompt text, rendering text, custom entry strings, session layout, or result details.
- Prefer mechanical moves over rewrites. If a helper can be moved unchanged, move it unchanged.
- Keep old root import paths as compatibility barrels until all tests pass:
  - `src/config.ts`
  - `src/context-transfer.ts`
  - `src/teammates.ts`
  - `src/builtin-teammates.ts`
  - `src/teammate-skills.ts`
  - `src/teammate-state.ts`
  - `src/delegation-policy.ts`
  - `src/job-registry.ts`
  - `src/manage-widget.ts`
  - `src/status-widget.ts`
  - `src/overlay-layout.ts`
  - `src/delegate-process.ts`
- If a type or helper is currently test-observed from `src/index.ts`, keep a re-export from `src/index.ts`.
- After each task, check file sizes with:

```bash
find src -type f -name '*.ts' -print | sort | xargs wc -l | sort -nr | head -20
```

- Record optimization ideas only in `docs/design/refactor-follow-up-optimizations.md`; do not implement them during this refactor.

## Target File Responsibilities

### Entry and registration

- `src/index.ts`: default Pi extension export only; calls registration helpers; re-exports `formatResolvedModelLabel` for compatibility.
- `src/extension/register-events.ts`: `session_start` and `before_agent_start` handlers.
- `src/extension/register-commands.ts`: command registration glue only.
- `src/extension/register-tools.ts`: delegate tool registration glue only.

### Delegate domain

- `src/delegate/types.ts`: `UsageStats`, `SingleResult`, `DelegateDetails`, `DelegateParams`, `OnUpdateCallback`, shared runner argument types.
- `src/delegate/schema.ts`: `TaskItem`, `ChainItem`, `ContextModeSchema`, `DelegateParamsSchema`.
- `src/delegate/model.ts`: `formatResolvedModelLabel`, `resolveTeammateModel`.
- `src/delegate/output.ts`: final-output, status, result-output, truncation, result metadata helpers.
- `src/delegate/display-items.ts`: `DisplayItem`, `getDisplayItems`.
- `src/delegate/session-paths.ts`: child session directory and job id helpers.
- `src/delegate/run-outcome.ts`: trackable message and usage extraction helpers.
- `src/delegate/single-runner.ts`: `runSingleTeammate`.
- `src/delegate/resume-runner.ts`: `resumeTeammateSession`.
- `src/delegate/execute.ts`: top-level delegate execution mode validation and routing.
- `src/delegate/chain.ts`: chain execution helper.
- `src/delegate/parallel.ts`: parallel execution helper.
- `src/delegate/tool-definition.ts`: tool description, prompt guidelines, schema, execute, render hooks.
- `src/delegate/render/format.ts`: token, usage, tool-call, result-header, status formatting.
- `src/delegate/render/render-call.ts`: delegate `renderCall` function.
- `src/delegate/render/render-result.ts`: delegate `renderResult` function.

### Commands

- `src/commands/manual-delegate.ts`: manual `/team:delegate` and `/team:handoff` behavior.
- `src/commands/session-transfer.ts`: `/summarize` and `/handoff` new-session transfer behavior.
- `src/commands/eject.ts`: `/team:eject` behavior.
- `src/commands/completions.ts`: teammate command completions.

### Existing medium-file splits with compatibility barrels

- `src/context-transfer.ts` becomes a compatibility barrel over:
  - `src/context/modes.ts`
  - `src/context/model-refs.ts`
  - `src/context/prompts.ts`
  - `src/context/generate.ts`
  - `src/context/messages.ts`
- `src/config.ts` becomes a compatibility barrel over:
  - `src/config/types.ts`
  - `src/config/defaults.ts`
  - `src/config/load.ts`
  - `src/config/sanitize.ts`
  - `src/config/merge.ts`
- Teammate/job files become compatibility barrels over focused folders:
  - `src/teammates/index.ts`, `src/teammates/types.ts`, `src/teammates/parse.ts`, `src/teammates/discover.ts`
  - `src/teammates/builtins.ts`, `src/teammates/skills.ts`, `src/teammates/state.ts`, `src/teammates/policy.ts`, `src/teammates/process.ts`
  - `src/jobs/types.ts`, `src/jobs/records.ts`, `src/jobs/queries.ts`
- UI files become compatibility barrels over:
  - `src/ui/manage/index.ts`, `src/ui/manage/actions.ts`, `src/ui/manage/component.ts`
  - `src/ui/status/index.ts`, `src/ui/status/actions.ts`, `src/ui/status/component.ts`
  - `src/ui/overlay-layout.ts`

---

### Task 1: Create isolation, baseline, and optimization backlog

**Files:**
- Create: `docs/design/refactor-follow-up-optimizations.md`
- Modify: none yet in source

- [ ] **Step 1: Start from the package root**

Run:

```bash
cd /home/arnold/.pi/agent/custom-extensions/pi-teammates
git status --short
git log --oneline -3
```

Expected: working tree is clean except pre-existing unrelated user files. If it is not clean, stop and ask before continuing.

- [ ] **Step 2: Run the baseline test suite**

Run:

```bash
npm test
```

Expected: typecheck and all unit tests pass before refactoring. If baseline fails, stop and diagnose before moving code.

- [ ] **Step 3: Record baseline file sizes**

Run:

```bash
find src -type f -name '*.ts' -print | sort | xargs wc -l | sort -nr
```

Expected: `src/index.ts` is the largest file and exceeds the repo size convention.

- [ ] **Step 4: Create the deferred optimization backlog document**

Write `docs/design/refactor-follow-up-optimizations.md` with this exact initial content:

```markdown
# Refactor Follow-up Optimizations

This backlog captures optimization opportunities discovered while performing the behavior-preserving domain-first modularization. Do not implement these items during the modularization pass unless required to preserve existing behavior.

## Entry Format

Each entry should use this format:

```text
### [Short title]

- Affected module/file:
- Observed issue:
- Potential improvement:
- Risk/impact:
- Suggested validation:
```

## Backlog

No follow-up optimizations recorded yet.
```

- [ ] **Step 5: Run docs-only status check**

Run:

```bash
git status --short
```

Expected: only `docs/design/refactor-follow-up-optimizations.md` is untracked.

- [ ] **Step 6: Commit the baseline docs setup**

Run:

```bash
git add docs/design/refactor-follow-up-optimizations.md
git commit -m "docs: add refactor optimization backlog"
```

Expected: commit succeeds.

---

### Task 2: Extract delegate shared types and pure output helpers

**Files:**
- Create: `src/delegate/types.ts`
- Create: `src/delegate/model.ts`
- Create: `src/delegate/output.ts`
- Create: `src/delegate/display-items.ts`
- Modify: `src/index.ts`
- Test: `tests/delegate.test.ts`

- [ ] **Step 1: Create `src/delegate/types.ts`**

Move the existing `UsageStats`, `SingleResult`, `DelegateDetails`, `DelegateParams`, and `OnUpdateCallback` definitions out of `src/index.ts`. The exported surface must be:

```typescript
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import type { TeammateContextMode } from "../context-transfer.ts";

export interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

export interface SingleResult {
	teammate: string;
	teammateSource: "user" | "project" | "builtin" | "unknown";
	task: string;
	contextMode?: TeammateContextMode;
	jobId?: string;
	sessionId?: string;
	sessionPath?: string;
	status?: string;
	exitCode: number;
	messages: Message[];
	stderr: string;
	usage: UsageStats;
	model?: string;
	stopReason?: string;
	errorMessage?: string;
	step?: number;
}

export interface DelegateDetails {
	mode: "single" | "parallel" | "chain";
	projectTeammatesDir: string | null;
	collapsedItemCount: number;
	results: SingleResult[];
}

export type DelegateParams = {
	resumeSessionId?: string;
	teammate?: string;
	task?: string;
	tasks?: Array<{ teammate: string; task: string; cwd?: string }>;
	chain?: Array<{ teammate: string; task: string; cwd?: string }>;
	context?: TeammateContextMode;
	cwd?: string;
};

export type OnUpdateCallback = (partial: AgentToolResult<DelegateDetails>) => void;
```

- [ ] **Step 2: Create `src/delegate/model.ts`**

Move `formatResolvedModelLabel` and `resolveTeammateModel` from `src/index.ts`. Preserve function bodies exactly except imports. The exported surface must include:

```typescript
import type { Model, ThinkingLevel } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { parseContextModelRef } from "../context-transfer.ts";

export function formatResolvedModelLabel(
	model: { provider: string; id: string } | undefined,
	thinkingLevel: ThinkingLevel | "off" | undefined,
): string | undefined {
	if (!model) return undefined;
	return thinkingLevel ? `${model.provider}/${model.id}:${thinkingLevel}` : `${model.provider}/${model.id}`;
}

export function resolveTeammateModel(args: {
	teammateModel: string | undefined;
	modelRegistry: ModelRegistry;
	fallbackModel: Model<any> | undefined;
}): { model: Model<any> | undefined; thinkingLevel: ThinkingLevel | undefined };
```

Use the exact current `resolveTeammateModel` function body from `src/index.ts`: empty teammate model returns the fallback model, `parseContextModelRef` parses with the fallback provider, invalid refs throw `Invalid teammate model reference: ...`, missing registry models throw `Configured teammate model not found: ...`, and valid refs return `{ model, thinkingLevel: parsed.thinking }`.

- [ ] **Step 3: Create `src/delegate/output.ts`**

Move these helpers from `src/index.ts` unchanged and export them:

```typescript
export function getFinalOutput(messages: Message[]): string;
export function isFailedResult(result: SingleResult): boolean;
export function isRunningResult(result: SingleResult): boolean;
export function isFinishedResult(result: SingleResult): boolean;
export function getResultOutput(result: SingleResult): string;
export function formatResultMetaLines(result: Pick<SingleResult, "sessionId" | "model">): string[];
export function prependResultMeta(result: Pick<SingleResult, "sessionId" | "model">, body: string): string;
export function formatChainResultLabel(result: Pick<SingleResult, "teammate" | "sessionId" | "model">): string;
export function truncateParallelOutput(output: string, maxBytes: number): string;
```

Use these imports at the top of `output.ts`:

```typescript
import type { Message } from "@earendil-works/pi-ai";
import type { SingleResult } from "./types.ts";
```

- [ ] **Step 4: Create `src/delegate/display-items.ts`**

Move `DisplayItem` and `getDisplayItems` unchanged. The file should start with:

```typescript
import type { Message } from "@earendil-works/pi-ai";

export type DisplayItem =
	| { type: "text"; text: string }
	| { type: "toolCall"; name: string; args: Record<string, any> };

export function getDisplayItems(messages: Message[]): DisplayItem[];
```

Use the exact current `getDisplayItems` function body from `src/index.ts`: iterate assistant messages only, push text parts as `{ type: "text", text }`, push tool-call parts as `{ type: "toolCall", name: part.name, args: part.arguments }`, and return the collected list.

- [ ] **Step 5: Update `src/index.ts` imports and compatibility export**

Remove the moved type/helper declarations from `src/index.ts`. Add these imports/exports:

```typescript
import { formatResolvedModelLabel, resolveTeammateModel } from "./delegate/model.ts";
import { getDisplayItems } from "./delegate/display-items.ts";
import {
	formatChainResultLabel,
	getFinalOutput,
	getResultOutput,
	isFailedResult,
	isFinishedResult,
	isRunningResult,
	prependResultMeta,
	truncateParallelOutput,
} from "./delegate/output.ts";
import type { DelegateDetails, DelegateParams, OnUpdateCallback, SingleResult, UsageStats } from "./delegate/types.ts";

export { formatResolvedModelLabel } from "./delegate/model.ts";
```

- [ ] **Step 6: Run the delegate-focused test**

Run:

```bash
npm run typecheck && tsx tests/delegate.test.ts
```

Expected: typecheck passes and `tests/delegate.test.ts` passes.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/index.ts src/delegate/types.ts src/delegate/model.ts src/delegate/output.ts src/delegate/display-items.ts
git commit -m "refactor(delegate): extract shared result helpers"
```

Expected: commit succeeds.

---

### Task 3: Extract delegate rendering modules

**Files:**
- Create: `src/delegate/render/format.ts`
- Create: `src/delegate/render/render-call.ts`
- Create: `src/delegate/render/render-result.ts`
- Modify: `src/index.ts`
- Test: `tests/delegate-rendering.test.ts`

- [ ] **Step 1: Create `src/delegate/render/format.ts`**

Move these helpers from `src/index.ts` unchanged:

```typescript
export function formatTokens(count: number): string;
export function formatUsageStats(usage: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number; contextTokens?: number; turns?: number }, model?: string): string;
export function formatToolCall(toolName: string, args: Record<string, unknown>, themeFg: (color: any, text: string) => string): string;
```

Use the same `node:os` import currently used by `formatToolCall`.

- [ ] **Step 2: Create `src/delegate/render/render-call.ts`**

Move the current `renderCall(args, theme)` function body from the delegate tool definition into this exported function:

```typescript
import { Text } from "@earendil-works/pi-tui";
import type { DelegateParams } from "../types.ts";

export function renderDelegateCall(args: DelegateParams, theme: any): Text;
```

Use the exact current `renderCall` body from `src/index.ts`: preserve the context suffix, title/wrap helper, resume/chain/tasks/single labels, and returned `Text` component.

- [ ] **Step 3: Create `src/delegate/render/render-result.ts`**

Move the current `renderResult(result, { expanded }, theme, context)` function body into this exported function:

```typescript
import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { getDisplayItems } from "../display-items.ts";
import {
	getFinalOutput,
	isFailedResult,
	isFinishedResult,
	isRunningResult,
} from "../output.ts";
import type { DelegateDetails, SingleResult } from "../types.ts";
import { formatToolCall, formatUsageStats } from "./format.ts";

export function renderDelegateResult(result: any, options: { expanded: boolean }, theme: any, context: any): Container | Text;
```

Use the exact current `renderResult` body from `src/index.ts`: preserve all expanded/collapsed single, chain, and parallel rendering branches, helper text, connectors, usage aggregation, and `(Ctrl+O to expand)` hints.

- [ ] **Step 4: Update the delegate tool render hooks in `src/index.ts`**

Import the rendering functions:

```typescript
import { renderDelegateCall } from "./delegate/render/render-call.ts";
import { renderDelegateResult } from "./delegate/render/render-result.ts";
```

Replace the inline hooks with:

```typescript
renderCall: renderDelegateCall,
renderResult: renderDelegateResult,
```

- [ ] **Step 5: Run rendering tests**

Run:

```bash
npm run typecheck && tsx tests/delegate-rendering.test.ts
```

Expected: typecheck passes and rendering snapshots/assertions still pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/index.ts src/delegate/render/format.ts src/delegate/render/render-call.ts src/delegate/render/render-result.ts
git commit -m "refactor(delegate): extract rendering modules"
```

Expected: commit succeeds.

---

### Task 4: Extract delegate runner primitives

**Files:**
- Create: `src/shared/concurrency.ts`
- Create: `src/delegate/session-paths.ts`
- Create: `src/delegate/run-outcome.ts`
- Create: `src/delegate/single-runner.ts`
- Create: `src/delegate/resume-runner.ts`
- Modify: `src/index.ts`
- Test: `tests/delegate.test.ts`, `tests/context.test.ts`, `tests/jobs.test.ts`

- [ ] **Step 1: Create `src/shared/concurrency.ts`**

Move `mapWithConcurrencyLimit` unchanged and export it:

```typescript
export async function mapWithConcurrencyLimit<TIn, TOut>(
	items: TIn[],
	concurrency: number,
	fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]>;
```

Use the exact current `mapWithConcurrencyLimit` body from `src/index.ts`: empty input returns `[]`, worker count is clamped between `1` and `items.length`, workers increment a shared `nextIndex`, store each result by original index, await `Promise.all(workers)`, then return `results`.

- [ ] **Step 2: Create `src/delegate/session-paths.ts`**

Move `buildChildSessionDir` and `createJobId` unchanged:

```typescript
import * as path from "node:path";

export function buildChildSessionDir(parentSessionDir: string, parentSessionId: string): string {
	return path.join(parentSessionDir, parentSessionId);
}

export function createJobId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
```

- [ ] **Step 3: Create `src/delegate/run-outcome.ts`**

Move `getTrackableMessages` and `extractRunOutcome` unchanged. Export both and import the existing types:

```typescript
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import type { UsageStats } from "./types.ts";

export function getTrackableMessages(messages: AgentMessage[]): Message[];

export function extractRunOutcome(messages: Message[]): { exitCode: number; stopReason?: string; errorMessage?: string; usage: UsageStats };
```

Use the exact current bodies from `src/index.ts`: `getTrackableMessages` keeps assistant and tool-result messages, and `extractRunOutcome` accumulates assistant usage, latest stop reason/error message, and returns exit code `1` only for `error` or `aborted` stop reasons.

- [ ] **Step 4: Create `src/delegate/single-runner.ts`**

Move `runSingleTeammate` unchanged. Export it. Use these imports as the starting import list and add any missing imports required by the moved body:

```typescript
import {
	createAgentSession,
	DefaultResourceLoader,
	getAgentDir,
	SessionManager,
	SettingsManager,
	type ModelRegistry,
	type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";
import {
	buildDelegatedUserTask,
	generateDelegationContext,
	selectContextMode,
	type TeammateContextMode,
} from "../context-transfer.ts";
import type { TeammatesSettingsConfig } from "../config.ts";
import { canDelegateToTeammate, resolveTeammateToolNames } from "../delegation-policy.ts";
import { createTeammateJobRecord, updateTeammateJobRecord, type TeammateJobRecord } from "../job-registry.ts";
import { buildInjectedSkillsPrompt } from "../teammate-skills.ts";
import { createTeammateSessionState, TEAMMATE_STATE_CUSTOM_TYPE } from "../teammate-state.ts";
import type { TeammateConfig } from "../teammates.ts";
import { formatResolvedModelLabel, resolveTeammateModel } from "./model.ts";
import { getFinalOutput } from "./output.ts";
import { extractRunOutcome, getTrackableMessages } from "./run-outcome.ts";
import { buildChildSessionDir, createJobId } from "./session-paths.ts";
import type { DelegateDetails, OnUpdateCallback, SingleResult } from "./types.ts";
```

- [ ] **Step 5: Create `src/delegate/resume-runner.ts`**

Move `resumeTeammateSession` unchanged. Export it. Use imports analogous to `single-runner.ts`, but only include dependencies used by resume.

- [ ] **Step 6: Update `src/index.ts` to import runner functions**

Remove moved helper definitions from `src/index.ts` and add:

```typescript
import { mapWithConcurrencyLimit } from "./shared/concurrency.ts";
import { runSingleTeammate } from "./delegate/single-runner.ts";
import { resumeTeammateSession } from "./delegate/resume-runner.ts";
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm run typecheck && tsx tests/delegate.test.ts && tsx tests/context.test.ts && tsx tests/jobs.test.ts
```

Expected: typecheck and focused tests pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/index.ts src/shared/concurrency.ts src/delegate/session-paths.ts src/delegate/run-outcome.ts src/delegate/single-runner.ts src/delegate/resume-runner.ts
git commit -m "refactor(delegate): extract session runners"
```

Expected: commit succeeds.

---

### Task 5: Extract delegate schema, execution routing, and tool definition

**Files:**
- Create: `src/delegate/schema.ts`
- Create: `src/delegate/chain.ts`
- Create: `src/delegate/parallel.ts`
- Create: `src/delegate/execute.ts`
- Create: `src/delegate/tool-definition.ts`
- Create: `src/extension/register-tools.ts`
- Modify: `src/index.ts`
- Test: `tests/delegate.test.ts`, `tests/delegate-rendering.test.ts`

- [ ] **Step 1: Create `src/delegate/schema.ts`**

Move `TaskItem`, `ChainItem`, `ContextModeSchema`, and `DelegateParamsSchema` unchanged. Export `DelegateParamsSchema`.

The file must include:

```typescript
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { TEAMMATE_CONTEXT_MODES } from "../context-transfer.ts";

export const TaskItem = Type.Object({
	teammate: Type.String({ description: "Name of the teammate to invoke" }),
	task: Type.String({ description: "Task to delegate to the teammate" }),
	cwd: Type.Optional(Type.String({ description: "Working directory for the teammate process" })),
});
```

Move the rest exactly from `src/index.ts`.

- [ ] **Step 2: Create `src/delegate/chain.ts`**

Extract the chain branch from the current delegate `execute` function into:

```typescript
export async function executeDelegateChain(args: {
	params: DelegateParams;
	ctx: any;
	runtimeConfig: TeammatesSettingsConfig;
	activeTools: string[];
	teammates: TeammateConfig[];
	lineage: string[];
	currentBranch: SessionEntry[];
	currentSessionId: string;
	currentSessionDir: string;
	currentSessionFile: string | undefined;
	appendJobRecord: (record: TeammateJobRecord) => void;
	onUpdate: OnUpdateCallback | undefined;
	signal: AbortSignal | undefined;
	makeDetails: (mode: "single" | "parallel" | "chain") => (results: SingleResult[]) => DelegateDetails;
}): Promise<{ content: Array<{ type: "text"; text: string }>; details: DelegateDetails }>;
```

Use the exact current chain branch body from `src/index.ts`, adapted only to read values from `args`: preserve previous-output replacement, per-step updates, failure short-circuit text, `formatChainResultLabel`, and final output behavior.

- [ ] **Step 3: Create `src/delegate/parallel.ts`**

Extract the parallel branch into `executeDelegateParallel` with the same argument object style as chain. Preserve max task validation, placeholder running results, concurrency limit, progress updates, truncation, and summary formatting exactly.

- [ ] **Step 4: Create `src/delegate/execute.ts`**

Move top-level delegate `execute` logic here. Export:

```typescript
export async function executeDelegateTool(args: {
	pi: ExtensionAPI;
	params: DelegateParams;
	signal: AbortSignal | undefined;
	onUpdate: OnUpdateCallback | undefined;
	ctx: any;
}) {
	// Move the current async execute body, replacing closure variables with args.pi/args.ctx/args.params.
}
```

Keep `formatAvailableTeammates`, `collectRequestedTeammates`, and `findTeammateJob` in this file unless a helper already belongs in `jobs/queries.ts` later.

- [ ] **Step 5: Create `src/delegate/tool-definition.ts`**

Move the static tool definition text and hooks here. Export:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DelegateParamsSchema } from "./schema.ts";
import { executeDelegateTool } from "./execute.ts";
import { renderDelegateCall } from "./render/render-call.ts";
import { renderDelegateResult } from "./render/render-result.ts";

export function registerDelegateTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "delegate",
		label: "Delegate",
		description: [
			// Move existing description strings unchanged.
		].join(" "),
		promptSnippet: "Delegate bounded execution work to configured teammates in isolated internal Pi sessions.",
		promptGuidelines: [
			// Move existing guideline strings unchanged.
		],
		parameters: DelegateParamsSchema,
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			return executeDelegateTool({ pi, params, signal, onUpdate, ctx });
		},
		renderCall: renderDelegateCall,
		renderResult: renderDelegateResult,
	});
}
```

Replace the comment placeholders with the exact existing strings before running tests.

- [ ] **Step 6: Create `src/extension/register-tools.ts`**

Write:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerDelegateTool } from "../delegate/tool-definition.ts";

export function registerTools(pi: ExtensionAPI): void {
	registerDelegateTool(pi);
}
```

- [ ] **Step 7: Update `src/index.ts`**

Remove all inline delegate schema/tool registration/execution code. Import and call `registerTools(pi)` from the default export.

- [ ] **Step 8: Run focused tests**

Run:

```bash
npm run typecheck && tsx tests/delegate.test.ts && tsx tests/delegate-rendering.test.ts
```

Expected: typecheck and focused tests pass.

- [ ] **Step 9: Commit**

Run:

```bash
git add src/index.ts src/delegate/schema.ts src/delegate/chain.ts src/delegate/parallel.ts src/delegate/execute.ts src/delegate/tool-definition.ts src/extension/register-tools.ts
git commit -m "refactor(delegate): extract tool execution routing"
```

Expected: commit succeeds.

---

### Task 6: Extract commands and extension events

**Files:**
- Create: `src/commands/manual-delegate.ts`
- Create: `src/commands/session-transfer.ts`
- Create: `src/commands/eject.ts`
- Create: `src/commands/completions.ts`
- Create: `src/extension/register-commands.ts`
- Create: `src/extension/register-events.ts`
- Modify: `src/index.ts`
- Test: `tests/command-helpers.test.ts`, `tests/delegate.test.ts`

- [ ] **Step 1: Create `src/commands/manual-delegate.ts`**

Move `runManualTeammateDelegation` unchanged. Export it. Keep the argument shape the same except make it a named exported interface if helpful:

```typescript
export async function runManualTeammateDelegation(args: {
	pi: ExtensionAPI;
	ctx: Parameters<NonNullable<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>>[1];
	commandName: "team:delegate" | "team:handoff";
	forcedContext?: TeammateContextMode;
	rawArgs: string;
}): Promise<void> {
	// Move existing body unchanged.
}
```

- [ ] **Step 2: Create `src/commands/session-transfer.ts`**

Move `runNewSessionTransfer` unchanged and export it.

- [ ] **Step 3: Create `src/commands/eject.ts`**

Extract the `/team:eject` command handler body into:

```typescript
export async function runEjectBuiltinCommand(commandArgs: string, ctx: ExtensionCommandContext): Promise<void> {
	// Move existing handler body unchanged.
}
```

- [ ] **Step 4: Create `src/commands/completions.ts`**

Extract the `/team:delegate` `getArgumentCompletions` function into:

```typescript
export async function completeTeamDelegateArguments(prefix: string) {
	// Move existing completion body unchanged.
}
```

- [ ] **Step 5: Create `src/extension/register-commands.ts`**

Move all `pi.registerCommand(...)` calls here. The exported function must be:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function registerCommands(pi: ExtensionAPI): void {
	// Move existing command registrations unchanged, replacing inline bodies with command helpers.
}
```

- [ ] **Step 6: Create `src/extension/register-events.ts`**

Move the current `session_start` and `before_agent_start` handlers into:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function registerEvents(pi: ExtensionAPI): void {
	// Move existing pi.on(...) handlers unchanged.
}
```

- [ ] **Step 7: Update `src/index.ts` to a thin entrypoint**

After this task, `src/index.ts` should be close to this exact shape:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCommands } from "./extension/register-commands.ts";
import { registerEvents } from "./extension/register-events.ts";
import { registerTools } from "./extension/register-tools.ts";

export { formatResolvedModelLabel } from "./delegate/model.ts";

export default function teammatesExtension(pi: ExtensionAPI) {
	registerEvents(pi);
	registerCommands(pi);
	registerTools(pi);
}
```

- [ ] **Step 8: Run focused tests**

Run:

```bash
npm run typecheck && tsx tests/command-helpers.test.ts && tsx tests/delegate.test.ts && tsx tests/delegate-rendering.test.ts
```

Expected: typecheck and focused tests pass.

- [ ] **Step 9: Commit**

Run:

```bash
git add src/index.ts src/commands/manual-delegate.ts src/commands/session-transfer.ts src/commands/eject.ts src/commands/completions.ts src/extension/register-commands.ts src/extension/register-events.ts
git commit -m "refactor(extension): extract commands and events"
```

Expected: commit succeeds.

---

### Task 7: Split context-transfer into context modules with a compatibility barrel

**Files:**
- Create: `src/context/modes.ts`
- Create: `src/context/model-refs.ts`
- Create: `src/context/prompts.ts`
- Create: `src/context/messages.ts`
- Create: `src/context/generate.ts`
- Create: `src/context/index.ts`
- Modify: `src/context-transfer.ts`
- Test: `tests/context.test.ts`

- [ ] **Step 1: Move context modes to `src/context/modes.ts`**

Move and export:

```typescript
export const TEAMMATE_CONTEXT_MODES = ["new", "inherit", "summary", "handoff"] as const;
export type TeammateContextMode = (typeof TEAMMATE_CONTEXT_MODES)[number];

export function parseTeammateContextMode(value: unknown): TeammateContextMode {
	return typeof value === "string" && TEAMMATE_CONTEXT_MODES.includes(value as TeammateContextMode)
		? (value as TeammateContextMode)
		: "new";
}

export function selectContextMode(
	overrideMode: TeammateContextMode | undefined,
	defaultMode: TeammateContextMode,
): TeammateContextMode {
	return overrideMode ?? defaultMode;
}
```

- [ ] **Step 2: Move prompts and config type to `src/context/prompts.ts`**

Move `TeammatesContextConfig`, `SUMMARY_SYSTEM_PROMPT`, and `HANDOFF_SYSTEM_PROMPT`. Export the prompts so `generate.ts` can use them.

- [ ] **Step 3: Move model parsing to `src/context/model-refs.ts`**

Move `ParsedContextModelRef`, `parseContextModelRef`, and `resolveConfiguredContextModelRefs` unchanged. Keep the `THINKING_LEVELS` set private.

- [ ] **Step 4: Move conversation message extraction to `src/context/messages.ts`**

Move `getContextTransferMessages`, `entryToMessage`, and `uniqueBy` if only used there. If `uniqueBy` is also needed by `model-refs.ts`, create `src/shared/arrays.ts` with:

```typescript
export function uniqueBy<T>(values: T[], keyFn: (value: T) => string): T[] {
	const seen = new Set<string>();
	const out: T[] = [];
	for (const value of values) {
		const key = keyFn(value);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(value);
	}
	return out;
}
```

- [ ] **Step 5: Move context generation to `src/context/generate.ts`**

Move `buildDelegatedUserTask`, `generateDelegationContext`, `resolveGenerationCandidates`, and related private types unchanged.

- [ ] **Step 6: Create `src/context/index.ts` barrel**

Write:

```typescript
export * from "./modes.ts";
export * from "./model-refs.ts";
export * from "./prompts.ts";
export * from "./messages.ts";
export * from "./generate.ts";
```

- [ ] **Step 7: Replace `src/context-transfer.ts` with compatibility re-exports**

Overwrite `src/context-transfer.ts` with:

```typescript
export * from "./context/index.ts";
```

- [ ] **Step 8: Run context tests**

Run:

```bash
npm run typecheck && tsx tests/context.test.ts
```

Expected: typecheck and context tests pass.

- [ ] **Step 9: Commit**

Run:

```bash
git add src/context-transfer.ts src/context src/shared/arrays.ts
git commit -m "refactor(context): split context transfer modules"
```

If `src/shared/arrays.ts` was not created, omit it from `git add`.

---

### Task 8: Split config loading into config modules with a compatibility barrel

**Files:**
- Create: `src/config/types.ts`
- Create: `src/config/defaults.ts`
- Create: `src/config/cache.ts`
- Create: `src/config/sanitize.ts`
- Create: `src/config/merge.ts`
- Create: `src/config/load.ts`
- Create: `src/config/index.ts`
- Modify: `src/config.ts`
- Test: `tests/config.test.ts`

- [ ] **Step 1: Move config types to `src/config/types.ts`**

Move `TeammatesSettingsConfig`, `PiTeammatesConfig`, `LoadedTeammatesConfig`, and `DeepPartial` unchanged.

- [ ] **Step 2: Move defaults and key lists to `src/config/defaults.ts`**

Move `DEFAULT_TEAMMATES_CONFIG`, `TEAMMATES_KEYS`, and `TEAMMATES_CONTEXT_KEYS`. Export all three.

- [ ] **Step 3: Move mtime cache helpers to `src/config/cache.ts`**

Move `ConfigCacheEntry`, `_configCache`, `getSettingsMtimes`, and `mtimesEqual`. Export only the functions and cache map needed by `load.ts`.

- [ ] **Step 4: Move sanitizers to `src/config/sanitize.ts`**

Move `sanitizeTeammatesSettings`, `sanitizeContextConfig`, `sanitizeToolAliases`, `sanitizeStringList`, and `positiveIntegerOrDefault`. Export `sanitizeTeammatesSettings`.

- [ ] **Step 5: Move merge/object helpers to `src/config/merge.ts`**

Move `deepMerge`, `pickKnown`, `normalizeConfigAliases`, `snakeToCamel`, `clone`, and `isPlainObject`. Export `deepMerge`, `pickKnown`, and `normalizeConfigAliases` because tests currently import `deepMerge` from `src/config.ts`.

- [ ] **Step 6: Move load function to `src/config/load.ts`**

Move `loadTeammatesConfig` and `settingsSources` unchanged, importing helpers from the new modules.

- [ ] **Step 7: Create `src/config/index.ts` barrel and compatibility file**

Write `src/config/index.ts`:

```typescript
export * from "./types.ts";
export * from "./defaults.ts";
export * from "./merge.ts";
export * from "./load.ts";
```

Overwrite `src/config.ts` with:

```typescript
export * from "./config/index.ts";
```

- [ ] **Step 8: Run config tests**

Run:

```bash
npm run typecheck && tsx tests/config.test.ts
```

Expected: typecheck and config tests pass.

- [ ] **Step 9: Commit**

Run:

```bash
git add src/config.ts src/config
git commit -m "refactor(config): split settings loading modules"
```

Expected: commit succeeds.

---

### Task 9: Split teammate and job modules with compatibility barrels

**Files:**
- Create: `src/teammates/types.ts`
- Create: `src/teammates/parse.ts`
- Create: `src/teammates/discover.ts`
- Create: `src/teammates/builtins.ts`
- Create: `src/teammates/skills.ts`
- Create: `src/teammates/state.ts`
- Create: `src/teammates/policy.ts`
- Create: `src/teammates/process.ts`
- Create: `src/teammates/index.ts`
- Create: `src/jobs/types.ts`
- Create: `src/jobs/records.ts`
- Create: `src/jobs/queries.ts`
- Create: `src/jobs/index.ts`
- Modify: root compatibility files listed below
- Test: `tests/teammates.test.ts`, `tests/builtin-teammates.test.ts`, `tests/teammate-state.test.ts`, `tests/jobs.test.ts`, `tests/process.test.ts`

- [ ] **Step 1: Split `src/teammates.ts` into `src/teammates/`**

Move public types to `src/teammates/types.ts`:

```typescript
export type TeammateSource = "user" | "project" | "builtin";
export type TeammatePromptMode = "append" | "replace";
export interface TeammateConfig {
	name: string;
	description: string;
	model?: string;
	tools?: Record<string, boolean>;
	systemPrompt: string;
	filePath: string;
	source: TeammateSource;
	promptMode: TeammatePromptMode;
	contextMode: TeammateContextMode;
	skills: string[];
}

export interface TeammateDiscoveryResult {
	teammates: TeammateConfig[];
	projectTeammatesDir: string | null;
	warnings: string[];
}

export interface DiscoverTeammatesOptions {
	agentDir?: string;
	loadProjectTeammates?: boolean;
}
```

Move `parseTeammateMarkdown` and parsing helpers to `src/teammates/parse.ts`.

Move `discoverTeammates`, `findNearestProjectTeammatesDir`, cache helpers, directory scanning, and file loading to `src/teammates/discover.ts`.

- [ ] **Step 2: Split builtin, skills, state, policy, and process helpers into teammate folder**

Move files mechanically:

```bash
git mv src/builtin-teammates.ts src/teammates/builtins.ts
git mv src/teammate-skills.ts src/teammates/skills.ts
git mv src/teammate-state.ts src/teammates/state.ts
git mv src/delegation-policy.ts src/teammates/policy.ts
git mv src/delegate-process.ts src/teammates/process.ts
```

Update relative imports inside moved files.

- [ ] **Step 3: Create teammate barrel and compatibility files**

Write `src/teammates/index.ts`:

```typescript
export * from "./types.ts";
export * from "./parse.ts";
export * from "./discover.ts";
```

Overwrite root compatibility files:

```typescript
// src/teammates.ts
export * from "./teammates/index.ts";

// src/builtin-teammates.ts
export * from "./teammates/builtins.ts";

// src/teammate-skills.ts
export * from "./teammates/skills.ts";

// src/teammate-state.ts
export * from "./teammates/state.ts";

// src/delegation-policy.ts
export * from "./teammates/policy.ts";

// src/delegate-process.ts
export * from "./teammates/process.ts";
```

- [ ] **Step 4: Split `src/job-registry.ts` into `src/jobs/`**

Move job types/constants to `src/jobs/types.ts`, record creation/update/normalization to `src/jobs/records.ts`, and collection/query helpers to `src/jobs/queries.ts`.

Write `src/jobs/index.ts`:

```typescript
export * from "./types.ts";
export * from "./records.ts";
export * from "./queries.ts";
```

Overwrite `src/job-registry.ts`:

```typescript
export * from "./jobs/index.ts";
```

- [ ] **Step 5: Run teammate/job tests**

Run:

```bash
npm run typecheck && tsx tests/teammates.test.ts && tsx tests/builtin-teammates.test.ts && tsx tests/teammate-state.test.ts && tsx tests/jobs.test.ts && tsx tests/process.test.ts
```

Expected: typecheck and focused tests pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/teammates.ts src/builtin-teammates.ts src/teammate-skills.ts src/teammate-state.ts src/delegation-policy.ts src/delegate-process.ts src/teammates src/job-registry.ts src/jobs
git commit -m "refactor(teammates): split teammate and job modules"
```

Expected: commit succeeds.

---

### Task 10: Split UI overlays with compatibility barrels

**Files:**
- Create: `src/ui/overlay-layout.ts`
- Create: `src/ui/manage/index.ts`
- Create: `src/ui/manage/actions.ts`
- Create: `src/ui/manage/component.ts`
- Create: `src/ui/status/index.ts`
- Create: `src/ui/status/actions.ts`
- Create: `src/ui/status/component.ts`
- Modify: `src/manage-widget.ts`
- Modify: `src/status-widget.ts`
- Modify: `src/overlay-layout.ts`
- Test: `tests/overlay-layout.test.ts`

- [ ] **Step 1: Move overlay layout helpers**

Run:

```bash
git mv src/overlay-layout.ts src/ui/overlay-layout.ts
```

Create a new compatibility `src/overlay-layout.ts`:

```typescript
export * from "./ui/overlay-layout.ts";
```

- [ ] **Step 2: Split manager widget**

Move `runTeammateManager`, file action helpers, and `ManageAction` to `src/ui/manage/actions.ts` where possible. Move `ManageOverlayComponent` and rendering helpers to `src/ui/manage/component.ts`. Export `runTeammateManager` from `src/ui/manage/index.ts`:

```typescript
export { runTeammateManager } from "./actions.ts";
```

Overwrite `src/manage-widget.ts`:

```typescript
export * from "./ui/manage/index.ts";
```

- [ ] **Step 3: Split status widget**

Move `showTeammateStatusOverlay`, `collectJobs`, and `showJobDetails` to `src/ui/status/actions.ts`. Move `StatusOverlayComponent`, `StatusAction`, `statusLabel`, and `padColumns` to `src/ui/status/component.ts`. Export `showTeammateStatusOverlay` from `src/ui/status/index.ts`:

```typescript
export { showTeammateStatusOverlay } from "./actions.ts";
```

Overwrite `src/status-widget.ts`:

```typescript
export * from "./ui/status/index.ts";
```

- [ ] **Step 4: Run UI/layout tests**

Run:

```bash
npm run typecheck && tsx tests/overlay-layout.test.ts
```

Expected: typecheck and overlay layout tests pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/ui src/manage-widget.ts src/status-widget.ts src/overlay-layout.ts
git commit -m "refactor(ui): split teammate overlays"
```

Expected: commit succeeds.

---

### Task 11: Update changelog, architecture docs, and optimization backlog

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/design/refactor-follow-up-optimizations.md`
- Create: `docs/design/2026-06-09-domain-module-map.md`

- [ ] **Step 1: Create an internal module map**

Write `docs/design/2026-06-09-domain-module-map.md`:

```markdown
# pi-teammates Domain Module Map

This document records the production module layout after the behavior-preserving domain-first modularization.

## Entry Point

- `src/index.ts` wires Pi extension registration only.
- `src/extension/register-events.ts` registers lifecycle/system-prompt events.
- `src/extension/register-commands.ts` registers slash commands.
- `src/extension/register-tools.ts` registers the `delegate` tool.

## Delegate Domain

- `src/delegate/schema.ts` defines the `delegate` tool parameter schema.
- `src/delegate/tool-definition.ts` owns the tool metadata and connects execute/render hooks.
- `src/delegate/execute.ts` validates mode selection and routes single, parallel, chain, and resume calls.
- `src/delegate/single-runner.ts` creates and runs new internal teammate sessions.
- `src/delegate/resume-runner.ts` resumes persisted teammate sessions.
- `src/delegate/chain.ts` handles sequential chain execution.
- `src/delegate/parallel.ts` handles parallel task execution.
- `src/delegate/output.ts` formats model-visible result text.
- `src/delegate/render/` formats TUI-visible call/result output.

## Context, Config, Teammates, Jobs, UI

- `src/context/` handles context modes, context model refs, context prompts, message extraction, and context packet generation.
- `src/config/` handles default settings, scoped loading, sanitization, merging, and cache invalidation.
- `src/teammates/` handles teammate discovery, parsing, builtins, skills, state, recursion policy, and lineage.
- `src/jobs/` handles teammate job record persistence and queries.
- `src/ui/` handles teammate management/status overlays and shared overlay layout helpers.

## Compatibility Barrels

The root files `src/config.ts`, `src/context-transfer.ts`, `src/teammates.ts`, `src/job-registry.ts`, and related historical root files re-export from the new domain folders to preserve existing internal import paths and tests.
```

- [ ] **Step 2: Update `CHANGELOG.md`**

Under `[Unreleased] -> Changed`, add:

```markdown
- Refactored production TypeScript into focused domain modules while preserving `delegate`, command, teammate discovery, context-transfer, job persistence, and TUI behavior.
```

- [ ] **Step 3: Update optimization backlog entries**

If optimization ideas were discovered, append them under `## Backlog` in `docs/design/refactor-follow-up-optimizations.md`. If no ideas were discovered, leave the initial “No follow-up optimizations recorded yet.” line intact.

At minimum, if observed during extraction, record this entry:

```markdown
### Shared child-session setup helper

- Affected module/file: `src/delegate/single-runner.ts`, `src/delegate/resume-runner.ts`
- Observed issue: Fresh teammate runs and resumed teammate runs both set up settings managers, resource loaders, injected skills, session binding, effective model tracking, abort handling, and snapshot synchronization.
- Potential improvement: Extract a shared child-session runtime helper that accepts creation/opening differences as parameters.
- Risk/impact: Medium. It could reduce duplication, but mistakes could affect resume reliability.
- Suggested validation: Unit tests for shared setup plus a real persisted delegate/resume flow in an interactive or JSON-mode Pi session.
```

- [ ] **Step 4: Commit docs/changelog**

Run:

```bash
git add CHANGELOG.md docs/design/2026-06-09-domain-module-map.md docs/design/refactor-follow-up-optimizations.md
git commit -m "docs: document pi-teammates module map"
```

Expected: commit succeeds.

---

### Task 12: Final verification and package sanity check

**Files:**
- Modify: none unless verification reveals a missed import or docs typo

- [ ] **Step 1: Run line-count check**

Run:

```bash
find src -type f -name '*.ts' -print | sort | xargs wc -l | sort -nr | head -30
```

Expected: production files are generally under 300-500 SLoC. Any file above 500 should be listed in the final report with justification. `src/index.ts` should be a thin entrypoint.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected: typecheck and all unit tests pass.

- [ ] **Step 3: Run package dry-run**

Run:

```bash
npm pack --dry-run
```

Expected: package includes `src/`, `examples/`, `skills/`, README, changelog, license, and package metadata. No `node_modules`, logs, temporary files, or tarballs are included.

- [ ] **Step 4: Inspect final diff from the branch base**

Run:

```bash
git status --short
git log --oneline --decorate -12
```

Expected: working tree is clean and recent commits correspond to the refactor tasks.

- [ ] **Step 5: Final summary**

Report:

```text
Implementation summary:
- Entry point: src/index.ts is now a thin registration wrapper.
- Main domains split: delegate, commands, extension registration, context, config, teammates, jobs, UI, shared helpers.
- Behavior preservation: delegate schema/prompts/result details/commands/session persistence unchanged.
- Validation: npm test passed; npm pack --dry-run passed.
- Largest remaining files: [paste top line-count results and justify any >500 SLoC].
- Deferred optimizations recorded: [count and titles from docs/design/refactor-follow-up-optimizations.md].
```

Do not claim live delegate resume/recovery works unless a real delegate/resume flow was validated beyond the unit tests.
