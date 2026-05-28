import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import {
	type ExtensionAPI,
	getMarkdownTheme,
	withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { loadTeammatesConfig, type TeammatesSettingsConfig } from "./config.ts";
import {
	buildTeamPromptBlock,
	canDelegateToTeammate,
	resolveTeammateToolNames,
} from "./delegation-policy.ts";
import {
	buildDelegateProcessPlan,
	parseTeammatesLineage,
	TEAMMATES_LINEAGE_ENV,
} from "./delegate-process.ts";
import { discoverTeammates, type TeammateConfig } from "./teammates.ts";

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1000000).toFixed(1)}M`;
}

function formatUsageStats(
	usage: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		cost: number;
		contextTokens?: number;
		turns?: number;
	},
	model?: string,
): string {
	const parts: string[] = [];
	if (usage.turns) parts.push(`${usage.turns} turn${usage.turns > 1 ? "s" : ""}`);
	if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
	if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
	if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`);
	if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
	if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
	if (usage.contextTokens && usage.contextTokens > 0) {
		parts.push(`ctx:${formatTokens(usage.contextTokens)}`);
	}
	if (model) parts.push(model);
	return parts.join(" ");
}

function formatToolCall(
	toolName: string,
	args: Record<string, unknown>,
	themeFg: (color: any, text: string) => string,
): string {
	const shortenPath = (targetPath: string) => {
		const home = os.homedir();
		return targetPath.startsWith(home) ? `~${targetPath.slice(home.length)}` : targetPath;
	};

	switch (toolName) {
		case "bash":
		case "shell_exec": {
			const command = ((args.command as string) || (args.cmd as string) || "...") as string;
			const preview = command.length > 60 ? `${command.slice(0, 60)}...` : command;
			return themeFg("muted", "$ ") + themeFg("toolOutput", preview);
		}
		case "shell_write_stdin": {
			const sessionId = String(args.session_id ?? "?");
			const chars = typeof args.chars === "string" ? args.chars : "";
			if (!chars) return themeFg("muted", `poll session ${sessionId}`);
			const preview = chars.length > 32 ? `${chars.slice(0, 32)}...` : chars;
			return themeFg("muted", `stdin ${sessionId} `) + themeFg("toolOutput", preview);
		}
		case "shell_kill_session": {
			const sessionId = String(args.session_id ?? "?");
			const signal = typeof args.signal === "string" ? ` ${args.signal}` : "";
			return themeFg("muted", `kill session ${sessionId}${signal}`);
		}
		case "shell_list_sessions": {
			return themeFg("muted", "list sessions");
		}
		case "read": {
			const rawPath = (args.file_path || args.path || "...") as string;
			const filePath = shortenPath(rawPath);
			const offset = args.offset as number | undefined;
			const limit = args.limit as number | undefined;
			let text = themeFg("accent", filePath);
			if (offset !== undefined || limit !== undefined) {
				const startLine = offset ?? 1;
				const endLine = limit !== undefined ? startLine + limit - 1 : "";
				text += themeFg("warning", `:${startLine}${endLine ? `-${endLine}` : ""}`);
			}
			return themeFg("muted", "read ") + text;
		}
		case "write": {
			const rawPath = (args.file_path || args.path || "...") as string;
			const filePath = shortenPath(rawPath);
			const content = (args.content || "") as string;
			const lines = content.split("\n").length;
			let text = themeFg("muted", "write ") + themeFg("accent", filePath);
			if (lines > 1) text += themeFg("dim", ` (${lines} lines)`);
			return text;
		}
		case "edit": {
			const rawPath = (args.file_path || args.path || "...") as string;
			return themeFg("muted", "edit ") + themeFg("accent", shortenPath(rawPath));
		}
		case "ls": {
			const rawPath = (args.path || ".") as string;
			return themeFg("muted", "ls ") + themeFg("accent", shortenPath(rawPath));
		}
		case "find": {
			const pattern = (args.pattern || "*") as string;
			const rawPath = (args.path || ".") as string;
			return themeFg("muted", "find ") + themeFg("accent", pattern) + themeFg("dim", ` in ${shortenPath(rawPath)}`);
		}
		case "grep": {
			const pattern = (args.pattern || "") as string;
			const rawPath = (args.path || ".") as string;
			return (
				themeFg("muted", "grep ") +
				themeFg("accent", `/${pattern}/`) +
				themeFg("dim", ` in ${shortenPath(rawPath)}`)
			);
		}
		default: {
			const argsStr = JSON.stringify(args);
			const preview = argsStr.length > 50 ? `${argsStr.slice(0, 50)}...` : argsStr;
			return themeFg("accent", toolName) + themeFg("dim", ` ${preview}`);
		}
	}
}

interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

interface SingleResult {
	teammate: string;
	teammateSource: "user" | "project" | "unknown";
	task: string;
	exitCode: number;
	messages: Message[];
	stderr: string;
	usage: UsageStats;
	model?: string;
	stopReason?: string;
	errorMessage?: string;
	step?: number;
}

interface DelegateDetails {
	mode: "single" | "parallel" | "chain";
	projectTeammatesDir: string | null;
	collapsedItemCount: number;
	results: SingleResult[];
}

function getFinalOutput(messages: Message[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (message.role === "assistant") {
			for (const part of message.content) {
				if (part.type === "text") return part.text;
			}
		}
	}
	return "";
}

function isFailedResult(result: SingleResult): boolean {
	return result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted";
}

function getResultOutput(result: SingleResult): string {
	if (isFailedResult(result)) {
		return result.errorMessage || result.stderr || getFinalOutput(result.messages) || "(no output)";
	}
	return getFinalOutput(result.messages) || "(no output)";
}

function truncateParallelOutput(output: string, maxBytes: number): string {
	const byteLength = Buffer.byteLength(output, "utf8");
	if (byteLength <= maxBytes) return output;

	let truncated = output.slice(0, maxBytes);
	while (Buffer.byteLength(truncated, "utf8") > maxBytes) {
		truncated = truncated.slice(0, -1);
	}
	return `${truncated}\n\n[Output truncated: ${byteLength - Buffer.byteLength(truncated, "utf8")} bytes omitted. Full output preserved in tool details.]`;
}

type DisplayItem = { type: "text"; text: string } | { type: "toolCall"; name: string; args: Record<string, any> };

function getDisplayItems(messages: Message[]): DisplayItem[] {
	const items: DisplayItem[] = [];
	for (const message of messages) {
		if (message.role === "assistant") {
			for (const part of message.content) {
				if (part.type === "text") items.push({ type: "text", text: part.text });
				else if (part.type === "toolCall") items.push({ type: "toolCall", name: part.name, args: part.arguments });
			}
		}
	}
	return items;
}

async function mapWithConcurrencyLimit<TIn, TOut>(
	items: TIn[],
	concurrency: number,
	fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
	if (items.length === 0) return [];
	const limit = Math.max(1, Math.min(concurrency, items.length));
	const results: TOut[] = new Array(items.length);
	let nextIndex = 0;
	const workers = new Array(limit).fill(null).map(async () => {
		while (true) {
			const current = nextIndex++;
			if (current >= items.length) return;
			results[current] = await fn(items[current], current);
		}
	});
	await Promise.all(workers);
	return results;
}

async function writePromptToTempFile(teammateName: string, prompt: string): Promise<{ dir: string; filePath: string }> {
	const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-teammates-"));
	const safeName = teammateName.replace(/[^\w.-]+/g, "_");
	const filePath = path.join(tmpDir, `prompt-${safeName}.md`);
	await withFileMutationQueue(filePath, async () => {
		await fs.promises.writeFile(filePath, prompt, { encoding: "utf-8", mode: 0o600 });
	});
	return { dir: tmpDir, filePath };
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}

	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) {
		return { command: process.execPath, args };
	}

	return { command: "pi", args };
}

type OnUpdateCallback = (partial: AgentToolResult<DelegateDetails>) => void;

async function runSingleTeammate(args: {
	defaultCwd: string;
	runtimeConfig: TeammatesSettingsConfig;
	activeTools: string[];
	teammates: TeammateConfig[];
	lineage: string[];
	teammateName: string;
	task: string;
	cwd: string | undefined;
	step: number | undefined;
	signal: AbortSignal | undefined;
	onUpdate: OnUpdateCallback | undefined;
	makeDetails: (results: SingleResult[]) => DelegateDetails;
}): Promise<SingleResult> {
	const teammate = args.teammates.find((candidate) => candidate.name === args.teammateName);
	if (!teammate) {
		const available = args.teammates.map((candidate) => `"${candidate.name}"`).join(", ") || "none";
		return {
			teammate: args.teammateName,
			teammateSource: "unknown",
			task: args.task,
			exitCode: 1,
			messages: [],
			stderr: `Unknown teammate: "${args.teammateName}". Available teammates: ${available}.`,
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
			step: args.step,
		};
	}

	if (!canDelegateToTeammate({ targetName: teammate.name, lineage: args.lineage })) {
		return {
			teammate: teammate.name,
			teammateSource: teammate.source,
			task: args.task,
			exitCode: 1,
			messages: [],
			stderr: `Recursive delegation blocked for teammate "${teammate.name}". Current lineage: ${args.lineage.join(" -> ")}.`,
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
			step: args.step,
		};
	}

	const resolvedTools = resolveTeammateToolNames({
		activeTools: args.activeTools,
		toolToggles: teammate.tools,
		toolAliases: args.runtimeConfig.toolAliases,
		delegateEnabled: teammate.delegate,
	});
	const disableAllTools = teammate.tools !== undefined && resolvedTools.length === 0;

	let tmpPromptDir: string | null = null;
	let tmpPromptPath: string | null = null;

	const currentResult: SingleResult = {
		teammate: teammate.name,
		teammateSource: teammate.source,
		task: args.task,
		exitCode: 0,
		messages: [],
		stderr: "",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
		model: teammate.model,
		step: args.step,
	};

	const emitUpdate = () => {
		if (args.onUpdate) {
			args.onUpdate({
				content: [{ type: "text", text: getFinalOutput(currentResult.messages) || "(running...)" }],
				details: args.makeDetails([currentResult]),
			});
		}
	};

	try {
		if (teammate.systemPrompt.trim()) {
			const tmp = await writePromptToTempFile(teammate.name, teammate.systemPrompt);
			tmpPromptDir = tmp.dir;
			tmpPromptPath = tmp.filePath;
		}

		const plan = buildDelegateProcessPlan({
			defaultCwd: args.defaultCwd,
			task: args.task,
			cwd: args.cwd,
			promptFilePath: tmpPromptPath ?? undefined,
			promptMode: teammate.promptMode,
			model: teammate.model,
			tools: resolvedTools,
			disableAllTools,
			teammateName: teammate.name,
			lineage: args.lineage,
			env: process.env,
		});

		let wasAborted = false;
		const exitCode = await new Promise<number>((resolve) => {
			const invocation = getPiInvocation(plan.args);
			const proc = spawn(invocation.command, invocation.args, {
				cwd: plan.cwd,
				env: plan.env,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
			});
			let buffer = "";

			const processLine = (line: string) => {
				if (!line.trim()) return;
				let event: any;
				try {
					event = JSON.parse(line);
				} catch {
					return;
				}

				if (event.type === "message_end" && event.message) {
					const message = event.message as Message;
					currentResult.messages.push(message);

					if (message.role === "assistant") {
						currentResult.usage.turns++;
						const usage = message.usage;
						if (usage) {
							currentResult.usage.input += usage.input || 0;
							currentResult.usage.output += usage.output || 0;
							currentResult.usage.cacheRead += usage.cacheRead || 0;
							currentResult.usage.cacheWrite += usage.cacheWrite || 0;
							currentResult.usage.cost += usage.cost?.total || 0;
							currentResult.usage.contextTokens = usage.totalTokens || 0;
						}
						currentResult.model = message.model ?? currentResult.model;
						if (message.stopReason) currentResult.stopReason = message.stopReason;
						if (message.errorMessage) currentResult.errorMessage = message.errorMessage;
					}
					emitUpdate();
				}

				if (event.type === "tool_result_end" && event.message) {
					currentResult.messages.push(event.message as Message);
					emitUpdate();
				}
			};

			proc.stdout.on("data", (data) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) processLine(line);
			});

			proc.stderr.on("data", (data) => {
				currentResult.stderr += data.toString();
			});

			proc.on("close", (code) => {
				if (buffer.trim()) processLine(buffer);
				resolve(code ?? 0);
			});

			proc.on("error", () => {
				resolve(1);
			});

			if (args.signal) {
				const killProc = () => {
					wasAborted = true;
					proc.kill("SIGTERM");
					setTimeout(() => {
						if (!proc.killed) proc.kill("SIGKILL");
					}, 5000);
				};
				if (args.signal.aborted) killProc();
				else args.signal.addEventListener("abort", killProc, { once: true });
			}
		});

		currentResult.exitCode = exitCode;
		if (wasAborted) throw new Error("Teammate was aborted");
		return currentResult;
	} finally {
		if (tmpPromptPath) {
			try {
				fs.unlinkSync(tmpPromptPath);
			} catch {
				// ignore cleanup errors
			}
		}
		if (tmpPromptDir) {
			try {
				fs.rmdirSync(tmpPromptDir);
			} catch {
				// ignore cleanup errors
			}
		}
	}
}

function formatAvailableTeammates(teammates: TeammateConfig[]): string {
	return teammates.map((teammate) => `${teammate.name} (${teammate.source})`).join(", ") || "none";
}

function collectRequestedTeammates(params: DelegateParams): string[] {
	const names: string[] = [];
	if (params.teammate) names.push(params.teammate);
	for (const item of params.tasks ?? []) names.push(item.teammate);
	for (const item of params.chain ?? []) names.push(item.teammate);
	return names;
}

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

const DelegateParamsSchema = Type.Object({
	teammate: Type.Optional(Type.String({ description: "Name of the teammate to invoke (single mode)" })),
	task: Type.Optional(Type.String({ description: "Task to delegate (single mode)" })),
	tasks: Type.Optional(Type.Array(TaskItem, { description: "Parallel teammate tasks" })),
	chain: Type.Optional(Type.Array(ChainItem, { description: "Sequential teammate chain" })),
	cwd: Type.Optional(Type.String({ description: "Working directory for the teammate process (single mode)" })),
});

type DelegateParams = {
	teammate?: string;
	task?: string;
	tasks?: Array<{ teammate: string; task: string; cwd?: string }>;
	chain?: Array<{ teammate: string; task: string; cwd?: string }>;
	cwd?: string;
};

export default function teammatesExtension(pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event, ctx) => {
		const selectedTools = event.systemPromptOptions.selectedTools ?? [];
		if (!selectedTools.includes("delegate")) return;

		const runtimeConfig = loadTeammatesConfig(ctx.cwd).config.teammates;
		const lineage = parseTeammatesLineage(process.env[TEAMMATES_LINEAGE_ENV]);
		const discovery = discoverTeammates(ctx.cwd, {
			loadProjectTeammates: runtimeConfig.loadProjectTeammates,
		});
		const availableTeammates = discovery.teammates.filter((teammate) =>
			canDelegateToTeammate({ targetName: teammate.name, lineage }),
		);
		if (availableTeammates.length === 0) return;

		return {
			systemPrompt: `${event.systemPrompt}\n\n${buildTeamPromptBlock(availableTeammates)}`,
		};
	});

	pi.registerTool({
		name: "delegate",
		label: "Delegate",
		description: [
			"Delegate a bounded task to one teammate, several teammates in parallel, or a sequential teammate chain, each running in an isolated pi subprocess with its own context window.",
			"Use it for focused research, implementation, verification, or review work that benefits from a fresh context or teammate-specific prompt, tool, or model settings.",
			"Do not use it for vague handoffs; provide the exact files, constraints, and output you want back.",
			"Returns the final teammate output plus structured execution details, and streams progress while work is running.",
		].join(" "),
		promptSnippet: "Delegate bounded work to a configured teammate in an isolated pi subprocess.",
		promptGuidelines: [
			"Use `delegate` when a focused subtask benefits from a fresh context or teammate-specific instructions.",
			"When using `delegate`, provide the relevant files, constraints, and the exact output you want back.",
		],
		parameters: DelegateParamsSchema,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const runtimeConfig = loadTeammatesConfig(ctx.cwd).config.teammates;
			const lineage = parseTeammatesLineage(process.env[TEAMMATES_LINEAGE_ENV]);
			const discovery = discoverTeammates(ctx.cwd, {
				loadProjectTeammates: runtimeConfig.loadProjectTeammates,
			});
			const activeTools = pi.getActiveTools();
			const teammates = discovery.teammates.filter((teammate) =>
				canDelegateToTeammate({ targetName: teammate.name, lineage }),
			);

			const hasChain = (params.chain?.length ?? 0) > 0;
			const hasTasks = (params.tasks?.length ?? 0) > 0;
			const hasSingle = Boolean(params.teammate && params.task);
			const modeCount = Number(hasChain) + Number(hasTasks) + Number(hasSingle);

			const makeDetails =
				(mode: "single" | "parallel" | "chain") =>
				(results: SingleResult[]): DelegateDetails => ({
					mode,
					projectTeammatesDir: discovery.projectTeammatesDir,
					collapsedItemCount: runtimeConfig.collapsedItemCount,
					results,
				});

			if (modeCount !== 1) {
				return {
					content: [
						{
							type: "text",
							text: `Invalid parameters. Provide exactly one mode. Available teammates: ${formatAvailableTeammates(teammates)}`,
						},
					],
					details: makeDetails("single")([]),
				};
			}

			const blockedTeammates = collectRequestedTeammates(params).filter(
				(teammateName) => !canDelegateToTeammate({ targetName: teammateName, lineage }),
			);
			if (blockedTeammates.length > 0) {
				return {
					content: [
						{
							type: "text",
							text: `Recursive delegation blocked for teammate(s): ${blockedTeammates.join(", ")}. Current lineage: ${lineage.join(" -> ") || "(root)"}.`,
						},
					],
					details: makeDetails(hasChain ? "chain" : hasTasks ? "parallel" : "single")([]),
				};
			}

			if (params.chain && params.chain.length > 0) {
				const results: SingleResult[] = [];
				let previousOutput = "";

				for (let i = 0; i < params.chain.length; i++) {
					const step = params.chain[i];
					const taskWithContext = step.task.replace(/\{previous\}/g, previousOutput);
					const chainUpdate: OnUpdateCallback | undefined = onUpdate
						? (partial) => {
								const currentResult = partial.details?.results[0];
								if (!currentResult) return;
								onUpdate({
									content: partial.content,
									details: makeDetails("chain")([...results, currentResult]),
								});
							}
						: undefined;

					const result = await runSingleTeammate({
						defaultCwd: ctx.cwd,
						runtimeConfig,
						activeTools,
						teammates,
						lineage,
						teammateName: step.teammate,
						task: taskWithContext,
						cwd: step.cwd,
						step: i + 1,
						signal,
						onUpdate: chainUpdate,
						makeDetails: makeDetails("chain"),
					});
					results.push(result);

					if (isFailedResult(result)) {
						const errorMessage = getResultOutput(result);
						return {
							content: [{ type: "text", text: `Chain stopped at step ${i + 1} (${step.teammate}): ${errorMessage}` }],
							details: makeDetails("chain")(results),
						};
					}
					previousOutput = getFinalOutput(result.messages);
				}

				return {
					content: [{ type: "text", text: getFinalOutput(results[results.length - 1].messages) || "(no output)" }],
					details: makeDetails("chain")(results),
				};
			}

			if (params.tasks && params.tasks.length > 0) {
				if (params.tasks.length > runtimeConfig.maxParallelTasks) {
					return {
						content: [
							{
								type: "text",
								text: `Too many parallel tasks (${params.tasks.length}). Max is ${runtimeConfig.maxParallelTasks}.`,
							},
						],
						details: makeDetails("parallel")([]),
					};
				}

				const allResults: SingleResult[] = new Array(params.tasks.length);
				for (let i = 0; i < params.tasks.length; i++) {
					allResults[i] = {
						teammate: params.tasks[i].teammate,
						teammateSource: "unknown",
						task: params.tasks[i].task,
						exitCode: -1,
						messages: [],
						stderr: "",
						usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
					};
				}

				const emitParallelUpdate = () => {
					if (!onUpdate) return;
					const running = allResults.filter((result) => result.exitCode === -1).length;
					const done = allResults.filter((result) => result.exitCode !== -1).length;
					onUpdate({
						content: [{ type: "text", text: `Parallel: ${done}/${allResults.length} done, ${running} running...` }],
						details: makeDetails("parallel")([...allResults]),
					});
				};

				const results = await mapWithConcurrencyLimit(
					params.tasks,
					runtimeConfig.maxConcurrency,
					async (taskItem, index) => {
						const result = await runSingleTeammate({
							defaultCwd: ctx.cwd,
							runtimeConfig,
							activeTools,
							teammates,
							lineage,
							teammateName: taskItem.teammate,
							task: taskItem.task,
							cwd: taskItem.cwd,
							step: undefined,
							signal,
							onUpdate: (partial) => {
								if (!partial.details?.results[0]) return;
								allResults[index] = partial.details.results[0];
								emitParallelUpdate();
							},
							makeDetails: makeDetails("parallel"),
						});
						allResults[index] = result;
						emitParallelUpdate();
						return result;
					},
				);

				const successCount = results.filter((result) => !isFailedResult(result)).length;
				const summaries = results.map((result) => {
					const output = truncateParallelOutput(getResultOutput(result), runtimeConfig.perTaskOutputCap);
					const status = isFailedResult(result)
						? `failed${result.stopReason && result.stopReason !== "end" ? ` (${result.stopReason})` : ""}`
						: "completed";
					return `### [${result.teammate}] ${status}\n\n${output}`;
				});
				return {
					content: [
						{
							type: "text",
							text: `Parallel: ${successCount}/${results.length} succeeded\n\n${summaries.join("\n\n---\n\n")}`,
						},
					],
					details: makeDetails("parallel")(results),
				};
			}

			if (params.teammate && params.task) {
				const result = await runSingleTeammate({
					defaultCwd: ctx.cwd,
					runtimeConfig,
					activeTools,
					teammates,
					lineage,
					teammateName: params.teammate,
					task: params.task,
					cwd: params.cwd,
					step: undefined,
					signal,
					onUpdate,
					makeDetails: makeDetails("single"),
				});
				if (isFailedResult(result)) {
					const errorMessage = getResultOutput(result);
					return {
						content: [{ type: "text", text: `Teammate ${result.stopReason || "failed"}: ${errorMessage}` }],
						details: makeDetails("single")([result]),
					};
				}
				return {
					content: [{ type: "text", text: getFinalOutput(result.messages) || "(no output)" }],
					details: makeDetails("single")([result]),
				};
			}

			return {
				content: [{ type: "text", text: `Invalid parameters. Available teammates: ${formatAvailableTeammates(teammates)}` }],
				details: makeDetails("single")([]),
			};
		},

		renderCall(args, theme) {
			if (args.chain && args.chain.length > 0) {
				let text =
					theme.fg("toolTitle", theme.bold("delegate ")) +
					theme.fg("accent", `chain (${args.chain.length} steps)`);
				for (let i = 0; i < Math.min(args.chain.length, 3); i++) {
					const step = args.chain[i];
					const cleanTask = step.task.replace(/\{previous\}/g, "").trim();
					const preview = cleanTask.length > 40 ? `${cleanTask.slice(0, 40)}...` : cleanTask;
					text +=
						"\n  " +
						theme.fg("muted", `${i + 1}.`) +
						" " +
						theme.fg("accent", step.teammate) +
						theme.fg("dim", ` ${preview}`);
				}
				if (args.chain.length > 3) text += `\n  ${theme.fg("muted", `... +${args.chain.length - 3} more`)}`;
				return new Text(text, 0, 0);
			}
			if (args.tasks && args.tasks.length > 0) {
				let text =
					theme.fg("toolTitle", theme.bold("delegate ")) +
					theme.fg("accent", `parallel (${args.tasks.length} tasks)`);
				for (const taskItem of args.tasks.slice(0, 3)) {
					const preview = taskItem.task.length > 40 ? `${taskItem.task.slice(0, 40)}...` : taskItem.task;
					text += `\n  ${theme.fg("accent", taskItem.teammate)}${theme.fg("dim", ` ${preview}`)}`;
				}
				if (args.tasks.length > 3) text += `\n  ${theme.fg("muted", `... +${args.tasks.length - 3} more`)}`;
				return new Text(text, 0, 0);
			}
			const teammateName = args.teammate || "...";
			const preview = args.task ? (args.task.length > 60 ? `${args.task.slice(0, 60)}...` : args.task) : "...";
			let text = theme.fg("toolTitle", theme.bold("delegate ")) + theme.fg("accent", teammateName);
			text += `\n  ${theme.fg("dim", preview)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as DelegateDetails | undefined;
			if (!details || details.results.length === 0) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
			}

			const mdTheme = getMarkdownTheme();
			const collapsedItemCount = details.collapsedItemCount;

			const renderDisplayItems = (items: DisplayItem[], limit?: number) => {
				const toShow = limit ? items.slice(-limit) : items;
				const skipped = limit && items.length > limit ? items.length - limit : 0;
				let text = "";
				if (skipped > 0) text += theme.fg("muted", `... ${skipped} earlier items\n`);
				for (const item of toShow) {
					if (item.type === "text") {
						const preview = expanded ? item.text : item.text.split("\n").slice(0, 3).join("\n");
						text += `${theme.fg("toolOutput", preview)}\n`;
					} else {
						text += `${theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme))}\n`;
					}
				}
				return text.trimEnd();
			};

			if (details.mode === "single" && details.results.length === 1) {
				const single = details.results[0];
				const isError = isFailedResult(single);
				const icon = isError ? theme.fg("error", "✗") : theme.fg("success", "✓");
				const displayItems = getDisplayItems(single.messages);
				const finalOutput = getFinalOutput(single.messages);

				if (expanded) {
					const container = new Container();
					let header = `${icon} ${theme.fg("toolTitle", theme.bold(single.teammate))}${theme.fg("muted", ` (${single.teammateSource})`)}`;
					if (isError && single.stopReason) header += ` ${theme.fg("error", `[${single.stopReason}]`)}`;
					container.addChild(new Text(header, 0, 0));
					if (isError && single.errorMessage) {
						container.addChild(new Text(theme.fg("error", `Error: ${single.errorMessage}`), 0, 0));
					}
					container.addChild(new Spacer(1));
					container.addChild(new Text(theme.fg("muted", "─── Task ───"), 0, 0));
					container.addChild(new Text(theme.fg("dim", single.task), 0, 0));
					container.addChild(new Spacer(1));
					container.addChild(new Text(theme.fg("muted", "─── Output ───"), 0, 0));
					if (displayItems.length === 0 && !finalOutput) {
						container.addChild(new Text(theme.fg("muted", "(no output)"), 0, 0));
					} else {
						for (const item of displayItems) {
							if (item.type === "toolCall") {
								container.addChild(
									new Text(theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme)), 0, 0),
								);
							}
						}
						if (finalOutput) {
							container.addChild(new Spacer(1));
							container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
						}
					}
					const usageString = formatUsageStats(single.usage, single.model);
					if (usageString) {
						container.addChild(new Spacer(1));
						container.addChild(new Text(theme.fg("dim", usageString), 0, 0));
					}
					return container;
				}

				let text = `${icon} ${theme.fg("toolTitle", theme.bold(single.teammate))}${theme.fg("muted", ` (${single.teammateSource})`)}`;
				if (isError && single.stopReason) text += `\n${theme.fg("error", `[${single.stopReason}]`)}`;
				if (isError && single.errorMessage) text += `\n${theme.fg("error", `Error: ${single.errorMessage}`)}`;
				else if (displayItems.length === 0) text += `\n${theme.fg("muted", "(no output)")}`;
				else {
					text += `\n${renderDisplayItems(displayItems, collapsedItemCount)}`;
					if (displayItems.length > collapsedItemCount) text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
				}
				const usageString = formatUsageStats(single.usage, single.model);
				if (usageString) text += `\n${theme.fg("dim", usageString)}`;
				return new Text(text, 0, 0);
			}

			const aggregateUsage = (results: SingleResult[]) => {
				const total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 };
				for (const item of results) {
					total.input += item.usage.input;
					total.output += item.usage.output;
					total.cacheRead += item.usage.cacheRead;
					total.cacheWrite += item.usage.cacheWrite;
					total.cost += item.usage.cost;
					total.turns += item.usage.turns;
				}
				return total;
			};

			if (details.mode === "chain") {
				const successCount = details.results.filter((item) => item.exitCode === 0).length;
				const icon = successCount === details.results.length ? theme.fg("success", "✓") : theme.fg("error", "✗");

				if (expanded) {
					const container = new Container();
					container.addChild(
						new Text(
							icon +
								" " +
								theme.fg("toolTitle", theme.bold("chain ")) +
								theme.fg("accent", `${successCount}/${details.results.length} steps`),
							0,
							0,
						),
					);

					for (const item of details.results) {
						const itemIcon = item.exitCode === 0 ? theme.fg("success", "✓") : theme.fg("error", "✗");
						const displayItems = getDisplayItems(item.messages);
						const finalOutput = getFinalOutput(item.messages);

						container.addChild(new Spacer(1));
						container.addChild(
							new Text(`${theme.fg("muted", `─── Step ${item.step}: `) + theme.fg("accent", item.teammate)} ${itemIcon}`, 0, 0),
						);
						container.addChild(new Text(theme.fg("muted", "Task: ") + theme.fg("dim", item.task), 0, 0));

						for (const displayItem of displayItems) {
							if (displayItem.type === "toolCall") {
								container.addChild(
									new Text(
										theme.fg("muted", "→ ") + formatToolCall(displayItem.name, displayItem.args, theme.fg.bind(theme)),
										0,
										0,
									),
								);
							}
						}

						if (finalOutput) {
							container.addChild(new Spacer(1));
							container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
						}

						const stepUsage = formatUsageStats(item.usage, item.model);
						if (stepUsage) container.addChild(new Text(theme.fg("dim", stepUsage), 0, 0));
					}

					const usageString = formatUsageStats(aggregateUsage(details.results));
					if (usageString) {
						container.addChild(new Spacer(1));
						container.addChild(new Text(theme.fg("dim", `Total: ${usageString}`), 0, 0));
					}
					return container;
				}

				let text = icon + " " + theme.fg("toolTitle", theme.bold("chain ")) + theme.fg("accent", `${successCount}/${details.results.length} steps`);
				for (const item of details.results) {
					const itemIcon = item.exitCode === 0 ? theme.fg("success", "✓") : theme.fg("error", "✗");
					const displayItems = getDisplayItems(item.messages);
					text += `\n\n${theme.fg("muted", `─── Step ${item.step}: `)}${theme.fg("accent", item.teammate)} ${itemIcon}`;
					if (displayItems.length === 0) text += `\n${theme.fg("muted", "(no output)")}`;
					else text += `\n${renderDisplayItems(displayItems, 5)}`;
				}
				const usageString = formatUsageStats(aggregateUsage(details.results));
				if (usageString) text += `\n\n${theme.fg("dim", `Total: ${usageString}`)}`;
				text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
				return new Text(text, 0, 0);
			}

			if (details.mode === "parallel") {
				const running = details.results.filter((item) => item.exitCode === -1).length;
				const successCount = details.results.filter((item) => item.exitCode !== -1 && !isFailedResult(item)).length;
				const failCount = details.results.filter((item) => item.exitCode !== -1 && isFailedResult(item)).length;
				const isRunning = running > 0;
				const icon = isRunning
					? theme.fg("warning", "⏳")
					: failCount > 0
						? theme.fg("warning", "◐")
						: theme.fg("success", "✓");
				const status = isRunning
					? `${successCount + failCount}/${details.results.length} done, ${running} running`
					: `${successCount}/${details.results.length} tasks`;

				if (expanded && !isRunning) {
					const container = new Container();
					container.addChild(new Text(`${icon} ${theme.fg("toolTitle", theme.bold("parallel "))}${theme.fg("accent", status)}`, 0, 0));

					for (const item of details.results) {
						const itemIcon = isFailedResult(item) ? theme.fg("error", "✗") : theme.fg("success", "✓");
						const displayItems = getDisplayItems(item.messages);
						const finalOutput = getFinalOutput(item.messages);

						container.addChild(new Spacer(1));
						container.addChild(new Text(`${theme.fg("muted", "─── ") + theme.fg("accent", item.teammate)} ${itemIcon}`, 0, 0));
						container.addChild(new Text(theme.fg("muted", "Task: ") + theme.fg("dim", item.task), 0, 0));

						for (const displayItem of displayItems) {
							if (displayItem.type === "toolCall") {
								container.addChild(
									new Text(
										theme.fg("muted", "→ ") + formatToolCall(displayItem.name, displayItem.args, theme.fg.bind(theme)),
										0,
										0,
									),
								);
							}
						}

						if (finalOutput) {
							container.addChild(new Spacer(1));
							container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
						}

						const taskUsage = formatUsageStats(item.usage, item.model);
						if (taskUsage) container.addChild(new Text(theme.fg("dim", taskUsage), 0, 0));
					}

					const usageString = formatUsageStats(aggregateUsage(details.results));
					if (usageString) {
						container.addChild(new Spacer(1));
						container.addChild(new Text(theme.fg("dim", `Total: ${usageString}`), 0, 0));
					}
					return container;
				}

				let text = `${icon} ${theme.fg("toolTitle", theme.bold("parallel "))}${theme.fg("accent", status)}`;
				for (const item of details.results) {
					const itemIcon = item.exitCode === -1 ? theme.fg("warning", "⏳") : isFailedResult(item) ? theme.fg("error", "✗") : theme.fg("success", "✓");
					const displayItems = getDisplayItems(item.messages);
					text += `\n\n${theme.fg("muted", "─── ")}${theme.fg("accent", item.teammate)} ${itemIcon}`;
					if (displayItems.length === 0) {
						text += `\n${theme.fg("muted", item.exitCode === -1 ? "(running...)" : "(no output)")}`;
					} else {
						text += `\n${renderDisplayItems(displayItems, 5)}`;
					}
				}
				if (!isRunning) {
					const usageString = formatUsageStats(aggregateUsage(details.results));
					if (usageString) text += `\n\n${theme.fg("dim", `Total: ${usageString}`)}`;
				}
				if (!expanded) text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
				return new Text(text, 0, 0);
			}

			const text = result.content[0];
			return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
		},
	});
}
