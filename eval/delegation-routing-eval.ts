/**
 * Delegation routing A/B evaluation.
 *
 * Measures whether the NEW delegation prompt wording (parallel-first, decompose-then-batch,
 * per-member context attribute) produces better delegation *routing decisions* than the OLD
 * wording — not just that delegate gets used, but that independent work goes parallel,
 * dependent work goes chain, isolated work goes single, and trivial/judgment work is not
 * delegated at all.
 *
 * It presents a model the real `delegate` tool schema plus the injected system-prompt block,
 * gives it scenarios with a known-correct decomposition, captures the tool calls it emits on
 * turn 1, and scores them. The only variable between arms is the prompt wording; the tool
 * schema, base prompt, scenarios, model, and reasoning level are identical.
 *
 * Usage: tsx eval/delegation-routing-eval.ts [provider/model[:thinking]] [samplesPerCell]
 */
import { complete, type Model, type ThinkingLevel } from "@earendil-works/pi-ai";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { buildTeamPromptBlock as buildNewTeamBlock } from "../src/delegation-policy.ts";
import { TEAMMATE_CONTEXT_MODES } from "../src/context-transfer.ts";

// ─── Roster (mirrors the example teammates) ──────────────────────────────────

const ROSTER = [
	{ name: "scout", description: "Fast read-only recon: locates code, reads files, reports findings. Never edits.", contextMode: "new" as const },
	{ name: "reviewer", description: "Audits code for bugs, security regressions, and correctness. Returns findings, not fixes.", contextMode: "new" as const },
	{ name: "planner", description: "Produces a concrete implementation plan for a scoped feature or change.", contextMode: "summary" as const },
	{ name: "worker", description: "Implements bounded, well-specified changes: writes and edits code.", contextMode: "handoff" as const },
];

// ─── Tool schema (identical to the extension's DelegateParamsSchema) ──────────

const TaskItem = Type.Object({
	teammate: Type.String({ description: "Name of the teammate to invoke" }),
	task: Type.String({ description: "Task to delegate to the teammate" }),
	cwd: Type.Optional(Type.String({ description: "Working directory for the teammate process" })),
});
const ChainItem = Type.Object({
	teammate: Type.String({ description: "Name of the teammate to invoke" }),
	task: Type.String({ description: "Task with optional {previous} placeholder for prior output" }),
	cwd: Type.Optional(Type.String({ description: "Working directory for the teammate process" })),
});
const ContextModeSchema = Type.Unsafe<(typeof TEAMMATE_CONTEXT_MODES)[number]>({
	type: "string",
	enum: [...TEAMMATE_CONTEXT_MODES],
	description:
		"Context strategy override. new = task only (default). summary = fresh session plus generated summary. handoff = execution-oriented handoff packet. inherit = exact caller session clone. Omit to use the teammate's default.",
});
const DelegateParamsSchema = Type.Object({
	resumeSessionId: Type.Optional(Type.String({ description: "Resume a previously started teammate session by its returned session id." })),
	teammate: Type.Optional(Type.String({ description: "Name of the teammate to invoke (single mode)" })),
	task: Type.Optional(Type.String({ description: "Task to delegate (single mode)" })),
	tasks: Type.Optional(Type.Array(TaskItem, { description: "Parallel teammate tasks" })),
	chain: Type.Optional(Type.Array(ChainItem, { description: "Sequential teammate chain" })),
	context: Type.Optional(ContextModeSchema),
	cwd: Type.Optional(Type.String({ description: "Working directory for the teammate process (single mode)" })),
});

// ─── OLD vs NEW prompt wording ────────────────────────────────────────────────

const OLD_DESCRIPTION = [
	"Delegate bounded execution work to one configured teammate, several teammates in parallel, or a sequential teammate chain, each running in its own isolated internal Pi session.",
	"Use it when specialization, a fresh context window, or parallelism will materially improve the result.",
	"Do not use it for vague handoffs, open-ended 'think about this' requests, or work you can complete directly in the current session without losing quality.",
	"`context` controls how much caller state the child receives: `new` = task only, `inherit` = exact caller transcript/session state, `summary` = fresh session plus generated task-focused summary, `handoff` = fresh session plus generated execution-oriented handoff packet.",
	"If `context` is omitted, the teammate's configured default is used, and that default is `new` unless the teammate explicitly sets another mode.",
	"`resumeSessionId` resumes a previously interrupted teammate run and should be used instead of starting a new one when you already have the child session id.",
	"Returns the teammate's final output plus structured execution details, including child session ids needed for status and resume flows, and streams progress while work is running.",
].join(" ");
const OLD_GUIDELINES = [
	"Use `delegate` only after you have decided the actual subtask; delegate execution, not judgment.",
	"In every delegated task, state the concrete goal, relevant files or symbols, key constraints or risks, and the expected output.",
	"Prefer `context=new` for self-contained tasks and `context=summary` for fresh specialists that need broader background without the full transcript.",
	"Use `context=handoff` for one specific next-step execution brief; use `context=inherit` only when exact transcript continuity is required.",
	"Use parallel tasks only for independent workstreams; use chain steps only when later steps truly depend on earlier output, and use `{previous}` deliberately.",
	"Use `resumeSessionId` only to continue an existing interrupted child session; do not combine it with single, parallel, or chain task creation.",
	"After the teammate returns, synthesize or route the result yourself instead of assuming the child owns the overall conversation.",
];
function buildOldTeamBlock(): string {
	const members = ROSTER.map((t) => `<member name="${t.name}">${t.description}</member>`).join("\n");
	return [
		"<delegation_policy>",
		"Use delegation only for bounded execution tasks where specialization, isolation, or parallelism clearly helps.",
		"Do not delegate when you can complete the work directly from the current context without losing quality.",
		"Delegate execution, not judgment. Decide the real task yourself before calling `delegate`.",
		"Every delegated task should include the concrete goal, relevant files or symbols when known, important constraints or risks, and the expected output.",
		'Do not send vague prompts like "look into this", "handle it", or "fix the bug" without the actual scoped brief.',
		"Choose context deliberately: `new` for self-contained tasks, `summary` for fresh workers that need broader background, `handoff` for one specific next-step execution brief, and `inherit` only when transcript continuity is truly required.",
		"After a teammate returns, integrate the result yourself or issue a tighter follow-up; do not assume the child owns the conversation.",
		"</delegation_policy>",
		"<team>",
		members,
		"</team>",
	].join("\n");
}

const NEW_DESCRIPTION = [
	"Delegate bounded execution work to configured teammates in isolated Pi sessions.",
	"Use `tasks` (parallel array) whenever you have two or more independent subtasks — parallel runs all tasks concurrently at zero additional wall-clock cost and is the correct default for independent work.",
	"Use `chain` for sequential pipelines where each step uses `{previous}` output from the prior step.",
	"Use single (`teammate`+`task`) only for a single isolated subtask.",
	"Use it when specialization, a fresh context window, or parallelism will materially improve the result; do not use for vague requests or work you can complete inline without quality loss.",
	"`context` controls how much caller state each child receives: `new` = task only, `summary` = fresh session plus generated task-focused context summary, `handoff` = fresh session plus execution-oriented handoff packet, `inherit` = exact caller session clone.",
	"If `context` is omitted the teammate's configured default is used (`new` unless overridden in the teammate file).",
	"`resumeSessionId` resumes an interrupted teammate run; do not combine with new task parameters.",
	"Streams progress while running and returns each teammate's final output with session IDs for status and resume flows.",
].join(" ");
const NEW_GUIDELINES = [
	"Decompose work before calling delegate: identify all independent workstreams and sequential dependencies, then batch them into one call — N independent tasks into one `tasks` call (parallel), a sequential pipeline into one `chain` call.",
	"Never make multiple sequential delegate calls for independent subtasks — use `tasks` instead. Sequential delegation wastes wall-clock time and is the most common misuse of this tool.",
	"If you are about to emit more than one delegate call for subtasks that do not depend on each other, collapse them into a single `tasks` call — multiple delegate calls in one turn for independent work is the same mistake as making them sequentially.",
	"Use `delegate` only after you have decided the actual subtask; delegate execution, not judgment — decide the real work yourself first.",
	"In every delegated task, include the concrete goal, relevant files or symbols, key constraints or risks, and the expected output format.",
	"Prefer `context=new` for self-contained tasks; use `context=summary` when the teammate needs broader session background; use `context=handoff` for one specific next-step execution brief; use `context=inherit` only when exact transcript continuity is truly required.",
	"In chain tasks, use `{previous}` deliberately: only include it when the step genuinely depends on the prior output — do not copy it by default.",
	"Use `resumeSessionId` only to continue an existing interrupted child session; do not combine with new task parameters.",
	"After a teammate returns, synthesize or route the result yourself — do not assume the child owns the overall conversation.",
];

const BASE_PROMPT =
	"You are a senior coding assistant working inside a software repository. You can complete work directly, or offload bounded subtasks to specialized teammates using the `delegate` tool. Decide how to handle each request, then act by calling tools. When you do delegate, make the tool call(s) now rather than only describing what you would do.";

function buildSystemPrompt(arm: "old" | "new"): string {
	const teamBlock = arm === "old" ? buildOldTeamBlock() : buildNewTeamBlock(ROSTER);
	const guidelines = arm === "old" ? OLD_GUIDELINES : NEW_GUIDELINES;
	return [
		BASE_PROMPT,
		teamBlock,
		"<delegate_tool_guidelines>",
		...guidelines.map((g) => `- ${g}`),
		"</delegate_tool_guidelines>",
	].join("\n\n");
}

// ─── Scenarios with known-correct decomposition ──────────────────────────────

type ExpectedMode = "parallel" | "chain" | "single" | "none";
interface Scenario {
	id: string;
	cls: ExpectedMode;
	prompt: string;
	minItems?: number; // for parallel/chain
}

// Scenarios are designed to be investigation-free: the decomposition is fully determined
// by the prompt, so the only decision under test is HOW to route (parallel / chain / single /
// none), not "should I scout the repo first". This isolates the prompt-wording variable.
const SCENARIOS: Scenario[] = [
	// Parallel — unambiguously independent, named targets, no prior investigation needed.
	{
		id: "P1-read-three-files",
		cls: "parallel",
		minItems: 3,
		prompt:
			"Read these three specific files and report each one's full contents. They are independent reads with no dependency between them: README.md, package.json, and tsconfig.json.",
	},
	{
		id: "P2-summarize-two-services",
		cls: "parallel",
		minItems: 2,
		prompt:
			"Give me a one-paragraph summary of what each of these two independent services does, read straight from their READMEs (no other investigation needed): services/billing/README.md and services/notifications/README.md.",
	},
	{
		id: "P3-generate-three-artifacts",
		cls: "parallel",
		minItems: 3,
		prompt:
			"Generate three independent standalone artifacts from scratch — no repo reading required, none depends on the others: (a) a Node.js .gitignore file, (b) an MIT LICENSE file for 'Acme Inc', and (c) a GitHub Actions workflow that runs `npm test` on push.",
	},
	{
		id: "P4-audit-three-modules",
		cls: "parallel",
		minItems: 3,
		prompt:
			"Audit these three specific named files for security regressions and return one report per file. The three are unrelated and independent: src/auth/login.ts, src/payments/charge.ts, and src/uploads/handler.ts.",
	},
	// Chain — pre-decided pipelines, dependency explicit, no investigation needed.
	{
		id: "Ch1-migrate-plan-then-impl",
		cls: "chain",
		minItems: 2,
		prompt:
			"Both steps are already decided and the second depends on the first; do not investigate the repo first. Step 1: planner writes a migration plan to move from callbacks to async/await in src/db/. Step 2: worker implements that exact plan. Wire step 2 to consume step 1's output.",
	},
	{
		id: "Ch2-design-then-build",
		cls: "chain",
		minItems: 2,
		prompt:
			"Two pre-decided steps, no investigation needed, and step 2 must consume step 1's output: first the planner designs the request/response shape for a new GET /users endpoint; then the worker implements exactly that design.",
	},
	// Single — one isolated task.
	{
		id: "S1-single-review",
		cls: "single",
		prompt:
			"Have a teammate review src/index.ts for correctness bugs and report what it finds. Nothing else is needed — just that one file.",
	},
	// None — trivial / pure judgment, should be handled inline.
	{
		id: "N1-trivial-math",
		cls: "none",
		prompt: "What is 2 + 2? Just answer directly; this is trivial and does not need any delegation.",
	},
	{
		id: "N2-trivial-inline-edit",
		cls: "none",
		prompt:
			"In this one-line snippet, rename the variable `foo` to `bar` and show me the result: `const foo = 1;`. This is trivial — handle it inline, don't delegate.",
	},
];

// ─── Scoring ──────────────────────────────────────────────────────────────────

interface DelegateCall {
	mode: "parallel" | "chain" | "single" | "resume" | "unknown";
	itemCount: number;
	lastUsesPrevious: boolean;
}

function classifyCall(args: any): DelegateCall {
	if (Array.isArray(args?.tasks) && args.tasks.length > 0) {
		return { mode: "parallel", itemCount: args.tasks.length, lastUsesPrevious: false };
	}
	if (Array.isArray(args?.chain) && args.chain.length > 0) {
		const last = args.chain[args.chain.length - 1];
		return { mode: "chain", itemCount: args.chain.length, lastUsesPrevious: typeof last?.task === "string" && last.task.includes("{previous}") };
	}
	if (typeof args?.resumeSessionId === "string" && args.resumeSessionId.trim()) {
		return { mode: "resume", itemCount: 0, lastUsesPrevious: false };
	}
	if (args?.teammate && args?.task) {
		return { mode: "single", itemCount: 1, lastUsesPrevious: false };
	}
	return { mode: "unknown", itemCount: 0, lastUsesPrevious: false };
}

function scoreResponse(scenario: Scenario, calls: DelegateCall[]): { score: number; note: string } {
	const n = calls.length;
	if (scenario.cls === "none") {
		return n === 0 ? { score: 1, note: "no delegation (correct)" } : { score: 0, note: `over-delegated (${n} call(s))` };
	}
	if (n === 0) return { score: 0, note: "did not delegate" };

	if (scenario.cls === "parallel") {
		const min = scenario.minItems ?? 2;
		if (n === 1 && calls[0].mode === "parallel" && calls[0].itemCount >= min) return { score: 1, note: `1 tasks call, ${calls[0].itemCount} items` };
		if (n === 1 && calls[0].mode === "parallel") return { score: 0.7, note: `tasks but only ${calls[0].itemCount} items` };
		const allSingle = calls.every((c) => c.mode === "single");
		if (allSingle && n >= 2) return { score: 0.3, note: `ANTI-PATTERN: ${n} separate single calls instead of one tasks call` };
		if (calls.some((c) => c.mode === "parallel")) return { score: 0.5, note: `tasks split across ${n} calls` };
		if (n === 1 && calls[0].mode === "single") return { score: 0.2, note: "single call for multi-task work" };
		return { score: 0.2, note: `mixed/unexpected (${calls.map((c) => c.mode).join(",")})` };
	}
	if (scenario.cls === "chain") {
		const min = scenario.minItems ?? 2;
		if (n === 1 && calls[0].mode === "chain" && calls[0].itemCount >= min && calls[0].lastUsesPrevious) return { score: 1, note: `1 chain call, {previous} used` };
		if (n === 1 && calls[0].mode === "chain" && calls[0].itemCount >= min) return { score: 0.7, note: "chain but no {previous}" };
		const allSingle = calls.every((c) => c.mode === "single");
		if (allSingle && n >= 2) return { score: 0.3, note: `ANTI-PATTERN: ${n} separate single calls instead of one chain` };
		if (n === 1 && calls[0].mode === "parallel") return { score: 0.1, note: "WRONG: parallel for dependent work" };
		return { score: 0.2, note: `unexpected (${calls.map((c) => c.mode).join(",")})` };
	}
	// single
	if (n === 1 && calls[0].mode === "single") return { score: 1, note: "single (correct)" };
	if (n === 1 && (calls[0].mode === "parallel" || calls[0].mode === "chain") && calls[0].itemCount === 1) return { score: 0.7, note: "1-item array for single task" };
	return { score: 0.3, note: `unexpected (${n} calls: ${calls.map((c) => c.mode).join(",")})` };
}

// ─── Runner ────────────────────────────────────────────────────────────────────

function extractDelegateCalls(message: any): { calls: DelegateCall[]; rawArgs: any[]; text: string } {
	const calls: DelegateCall[] = [];
	const rawArgs: any[] = [];
	let text = "";
	for (const part of message.content ?? []) {
		if (part.type === "toolCall" && part.name === "delegate") {
			calls.push(classifyCall(part.arguments ?? {}));
			rawArgs.push(part.arguments ?? {});
		} else if (part.type === "text") {
			text += part.text;
		}
	}
	return { calls, rawArgs, text };
}

async function runOne(args: {
	model: Model<any>;
	apiKey: string;
	headers?: Record<string, string>;
	reasoning?: ThinkingLevel;
	arm: "old" | "new";
	scenario: Scenario;
}): Promise<{ calls: DelegateCall[]; rawArgs: any[]; text: string }> {
	const response = await complete(
		args.model,
		{
			systemPrompt: buildSystemPrompt(args.arm),
			messages: [{ role: "user", content: [{ type: "text", text: args.scenario.prompt }], timestamp: Date.now() }],
			tools: [
				{
					name: "delegate",
					description: args.arm === "old" ? OLD_DESCRIPTION : NEW_DESCRIPTION,
					parameters: DelegateParamsSchema,
				},
			],
		},
		{
			apiKey: args.apiKey,
			headers: args.headers,
			...(args.reasoning ? { reasoning: args.reasoning } : {}),
		} as any,
	);
	return extractDelegateCalls(response);
}

async function main() {
	const modelArg = process.argv[2] ?? "deepseek/deepseek-v4-flash:high";
	const samples = Number(process.argv[3] ?? "3");

	const slash = modelArg.indexOf("/");
	const provider = modelArg.slice(0, slash);
	let rest = modelArg.slice(slash + 1);
	let reasoning: ThinkingLevel | undefined;
	const colon = rest.lastIndexOf(":");
	if (colon > 0) {
		reasoning = rest.slice(colon + 1) as ThinkingLevel;
		rest = rest.slice(0, colon);
	}
	const modelId = rest;

	const authStorage = AuthStorage.create();
	const registry = ModelRegistry.create(authStorage);
	const model = registry.find(provider, modelId);
	if (!model) {
		console.error(`Model not found: ${provider}/${modelId}`);
		process.exit(1);
	}
	const auth = await registry.getApiKeyAndHeaders(model);
	if (!auth.ok || !auth.apiKey) {
		console.error(`No auth for ${provider}/${modelId}: ${auth.ok ? "no api key" : auth.error}`);
		process.exit(1);
	}

	console.log(`Model: ${provider}/${modelId}${reasoning ? `:${reasoning}` : ""}   samples/cell: ${samples}\n`);

	const arms: Array<"old" | "new"> = ["old", "new"];
	// results[arm][scenarioId] = number[]
	const results: Record<string, Record<string, number[]>> = { old: {}, new: {} };
	const notes: Record<string, Record<string, string[]>> = { old: {}, new: {} };

	for (const scenario of SCENARIOS) {
		for (const arm of arms) {
			results[arm][scenario.id] = [];
			notes[arm][scenario.id] = [];
		}
	}

	// Run all cells. Interleave arms per scenario sample to share conditions.
	for (const scenario of SCENARIOS) {
		for (let s = 0; s < samples; s++) {
			for (const arm of arms) {
				try {
					const { calls, rawArgs } = await runOne({ model, apiKey: auth.apiKey, headers: auth.headers, reasoning, arm, scenario });
					const { score, note } = scoreResponse(scenario, calls);
					results[arm][scenario.id].push(score);
					notes[arm][scenario.id].push(note);
					if (process.env.DUMP) {
						process.stdout.write(`    args: ${JSON.stringify(rawArgs)}\n`);
					}
					process.stdout.write(`[${arm}] ${scenario.id} #${s + 1}: ${score.toFixed(1)} (${note})\n`);
				} catch (error) {
					results[arm][scenario.id].push(0);
					notes[arm][scenario.id].push(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
					process.stdout.write(`[${arm}] ${scenario.id} #${s + 1}: ERROR ${error instanceof Error ? error.message : String(error)}\n`);
				}
			}
		}
	}

	// ─── Report ───
	const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
	console.log("\n══════════════════ PER-SCENARIO MEANS ══════════════════");
	console.log("scenario".padEnd(24), "class".padEnd(10), "OLD".padEnd(6), "NEW".padEnd(6), "Δ");
	const byClass: Record<string, { old: number[]; new: number[] }> = {};
	for (const scenario of SCENARIOS) {
		const o = mean(results.old[scenario.id]);
		const n = mean(results.new[scenario.id]);
		(byClass[scenario.cls] ??= { old: [], new: [] }).old.push(...results.old[scenario.id]);
		byClass[scenario.cls].new.push(...results.new[scenario.id]);
		const d = n - o;
		console.log(scenario.id.padEnd(24), scenario.cls.padEnd(10), o.toFixed(2).padEnd(6), n.toFixed(2).padEnd(6), (d >= 0 ? "+" : "") + d.toFixed(2));
	}
	console.log("\n══════════════════ PER-CLASS MEANS ══════════════════");
	console.log("class".padEnd(12), "OLD".padEnd(6), "NEW".padEnd(6), "Δ");
	for (const [cls, v] of Object.entries(byClass)) {
		const o = mean(v.old);
		const n = mean(v.new);
		const d = n - o;
		console.log(cls.padEnd(12), o.toFixed(2).padEnd(6), n.toFixed(2).padEnd(6), (d >= 0 ? "+" : "") + d.toFixed(2));
	}
	const allOld = mean(SCENARIOS.flatMap((sc) => results.old[sc.id]));
	const allNew = mean(SCENARIOS.flatMap((sc) => results.new[sc.id]));
	console.log("\n══════════════════ OVERALL ══════════════════");
	console.log(`OLD: ${allOld.toFixed(3)}   NEW: ${allNew.toFixed(3)}   Δ: ${(allNew - allOld >= 0 ? "+" : "") + (allNew - allOld).toFixed(3)}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
