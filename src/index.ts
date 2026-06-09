import { StringEnum } from "@earendil-works/pi-ai";
import {
	type ExtensionAPI,
	type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { ejectBuiltinTeammates, type BuiltinEjectScope } from "./builtin-teammates.ts";
import { loadTeammatesConfig } from "./config.ts";
import {
	buildDelegatedUserTask,
	generateDelegationContext,
	selectContextMode,
	TEAMMATE_CONTEXT_MODES,
	type TeammateContextMode,
} from "./context-transfer.ts";
import {
	buildManualDelegationTranscript,
	defaultNewSessionTask,
	improveDelegationTask,
	parseTeamCommandArgs,
} from "./command-helpers.ts";
import {
	buildTeamPromptBlock,
	canDelegateToTeammate,
} from "./delegation-policy.ts";
import { renderDelegateCall } from "./delegate/render/render-call.ts";
import { renderDelegateResult } from "./delegate/render/render-result.ts";
import { resumeTeammateSession } from "./delegate/resume-runner.ts";
import { runSingleTeammate } from "./delegate/single-runner.ts";
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
import type { DelegateDetails, DelegateParams, OnUpdateCallback, SingleResult } from "./delegate/types.ts";
import { parseTeammatesLineage, TEAMMATES_LINEAGE_ENV } from "./delegate-process.ts";
import {
	collectInterruptedTeammateJobs,
	collectLatestTeammateJobs,
	TEAMMATE_JOB_CUSTOM_TYPE,
	type TeammateJobRecord,
	updateTeammateJobRecord,
} from "./job-registry.ts";
import { runTeammateManager } from "./manage-widget.ts";
import { showTeammateStatusOverlay } from "./status-widget.ts";
import { mapWithConcurrencyLimit } from "./shared/concurrency.ts";
import {
	getLatestTeammateSessionState,
} from "./teammate-state.ts";
import { discoverTeammates, type TeammateConfig } from "./teammates.ts";

export { formatResolvedModelLabel } from "./delegate/model.ts";

function findTeammateJob(sessionEntries: SessionEntry[], sessionId: string): TeammateJobRecord | undefined {
	return collectLatestTeammateJobs(sessionEntries).get(sessionId);
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

const ContextModeSchema = StringEnum(TEAMMATE_CONTEXT_MODES, {
	description:
		"Context strategy override for this delegate call. new = task only (default, use for self-contained tasks). summary = fresh session plus a generated task-focused context summary (use when the teammate needs session background). handoff = fresh session plus a generated execution-oriented handoff packet (use for one specific next-step task). inherit = exact caller session clone (use only when transcript continuity is truly required). Omit to use the teammate's configured default, which is shown in the <team> block.",
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

async function runManualTeammateDelegation(args: {
	pi: ExtensionAPI;
	ctx: Parameters<NonNullable<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>>[1];
	commandName: "team:delegate" | "team:handoff";
	forcedContext?: TeammateContextMode;
	rawArgs: string;
}): Promise<void> {
	const parsed = parseTeamCommandArgs(args.rawArgs);
	const runtimeConfig = loadTeammatesConfig(args.ctx.cwd).config.teammates;
	const discovery = discoverTeammates(args.ctx.cwd, {
		loadProjectTeammates: runtimeConfig.loadProjectTeammates,
	});
	const teammateNames = discovery.teammates.map((teammate) => teammate.name);
	let teammateName = parsed.agent;
	if (!teammateName) {
		teammateName = await args.ctx.ui.select("Select teammate", teammateNames);
	}
	if (!teammateName) return;

	const teammate = discovery.teammates.find((candidate) => candidate.name === teammateName);
	if (!teammate) {
		args.ctx.ui.notify(`Unknown teammate: ${teammateName}`, "error");
		return;
	}

	let task = parsed.task;
	if (!task) {
		const entered = await args.ctx.ui.input("Delegated task", "Describe the task to offload");
		if (!entered?.trim()) return;
		task = entered.trim();
	}

	const selectedContext = selectContextMode(args.forcedContext, teammate.contextMode);
	if (parsed.improve) {
		if (!args.ctx.model) {
			args.ctx.ui.notify("No current session model available for --improve", "error");
			return;
		}
		const currentThinkingLevel = args.pi.getThinkingLevel();
		const improved = await improveDelegationTask({
			rawTask: task,
			branch: args.ctx.sessionManager.getBranch(),
			model: args.ctx.model,
			modelRegistry: args.ctx.modelRegistry,
			contextLabel: selectedContext,
			signal: args.ctx.signal,
			thinkingLevel: currentThinkingLevel === "off" ? undefined : currentThinkingLevel,
		});
		const edited = await args.ctx.ui.editor("Review delegated task", improved);
		if (!edited?.trim()) return;
		task = edited.trim();
	}

	const lineages = getLatestTeammateSessionState(args.ctx.sessionManager.getEntries())?.lineage ?? parseTeammatesLineage(process.env[TEAMMATES_LINEAGE_ENV]);
	const appendJobRecord = (record: TeammateJobRecord) => {
		args.pi.appendEntry(TEAMMATE_JOB_CUSTOM_TYPE, record);
	};
	args.ctx.ui.setStatus("team-command", `Delegating to ${teammateName}...`);
	const result = await runSingleTeammate({
		defaultCwd: args.ctx.cwd,
		runtimeConfig,
		activeTools: args.pi.getActiveTools(),
		teammates: discovery.teammates,
		lineage: lineages,
		parentBranch: args.ctx.sessionManager.getBranch(),
		parentSessionId: args.ctx.sessionManager.getSessionId(),
		parentSessionDir: args.ctx.sessionManager.getSessionDir(),
		currentSessionFile: args.ctx.sessionManager.getSessionFile(),
		currentModel: args.ctx.model,
		modelRegistry: args.ctx.modelRegistry,
		appendJobRecord,
		contextOverride: selectedContext,
		teammateName,
		task,
		cwd: undefined,
		step: undefined,
		signal: args.ctx.signal,
		onUpdate: undefined,
		makeDetails: (results) => ({
			mode: "single",
			projectTeammatesDir: discovery.projectTeammatesDir,
			collapsedItemCount: runtimeConfig.collapsedItemCount,
			results,
		}),
	});
	args.ctx.ui.setStatus("team-command", undefined);

	const transcript = buildManualDelegationTranscript({
		commandName: args.commandName,
		teammateName,
		contextMode: result.contextMode ?? selectedContext,
		task,
		sessionId: result.sessionId,
		model: result.model,
		resultText: getResultOutput(result),
		status: result.status ?? (isFailedResult(result) ? "failed" : "completed"),
	});
	args.pi.sendMessage({
		customType: "pi-teammates/manual-delegate",
		content: transcript,
		display: true,
		details: {
			command: args.commandName,
			teammate: teammateName,
			sessionId: result.sessionId,
			status: result.status,
		},
	}, { triggerTurn: false });

	const headline = result.sessionId ? `${teammateName} (${result.sessionId})` : teammateName;
	args.ctx.ui.notify(
		isFailedResult(result) ? `Delegation failed: ${headline}` : `Delegation finished: ${headline}`,
		isFailedResult(result) ? "warning" : "info",
	);
}

async function runNewSessionTransfer(args: {
	ctx: Parameters<NonNullable<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>>[1];
	mode: "summary" | "handoff";
	rawArgs: string;
}): Promise<void> {
	const task = defaultNewSessionTask(args.mode, args.rawArgs.trim());
	const runtimeConfig = loadTeammatesConfig(args.ctx.cwd).config.teammates;
	const packet = await generateDelegationContext({
		mode: args.mode,
		task,
		branch: args.ctx.sessionManager.getBranch(),
		contextConfig: runtimeConfig.context,
		currentModel: args.ctx.model,
		modelRegistry: args.ctx.modelRegistry,
		signal: args.ctx.signal,
	});
	const prompt = buildDelegatedUserTask({ mode: args.mode, task, generatedContext: packet });
	const edited = await args.ctx.ui.editor(`Review ${args.mode} session prompt`, prompt);
	if (!edited?.trim()) return;

	await args.ctx.newSession({
		parentSession: args.ctx.sessionManager.getSessionFile(),
		withSession: async (replacementCtx) => {
			replacementCtx.ui.setEditorText(edited.trim());
			replacementCtx.ui.notify(`${args.mode} prompt ready in the new session.`, "info");
		},
	});
}

export default function teammatesExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		for (const job of collectInterruptedTeammateJobs(ctx.sessionManager.getEntries())) {
			pi.appendEntry(TEAMMATE_JOB_CUSTOM_TYPE, updateTeammateJobRecord(job, "interrupted"));
		}
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const selectedTools = event.systemPromptOptions.selectedTools ?? [];
		if (!selectedTools.includes("delegate")) return;

		const runtimeConfig = loadTeammatesConfig(ctx.cwd).config.teammates;
		const lineage = getLatestTeammateSessionState(ctx.sessionManager.getEntries())?.lineage ?? parseTeammatesLineage(process.env[TEAMMATES_LINEAGE_ENV]);
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

	pi.registerCommand("team:delegate", {
		description: "Manually delegate a scoped task to a teammate while staying in the current session",
		getArgumentCompletions: async (prefix) => {
			const match = prefix.match(/(?:^|\s)--agent\s+(\S*)$/);
			if (!match) return null;
			const discovery = discoverTeammates(process.cwd(), {
				loadProjectTeammates: loadTeammatesConfig(process.cwd()).config.teammates.loadProjectTeammates,
			});
			return discovery.teammates
				.filter((teammate) => teammate.name.startsWith(match[1] ?? ""))
				.map((teammate) => ({ value: teammate.name, label: teammate.name }));
		},
		handler: async (commandArgs, ctx) => {
			await runManualTeammateDelegation({
				pi,
				ctx,
				commandName: "team:delegate",
				rawArgs: commandArgs,
			});
		},
	});

	pi.registerCommand("team:handoff", {
		description: "Manually offload a scoped task to a teammate using handoff context while staying in the current session",
		handler: async (commandArgs, ctx) => {
			await runManualTeammateDelegation({
				pi,
				ctx,
				commandName: "team:handoff",
				forcedContext: "handoff",
				rawArgs: commandArgs,
			});
		},
	});

	pi.registerCommand("summarize", {
		description: "Create a new normal Pi session from a generated summary of the current one",
		handler: async (commandArgs, ctx) => {
			await runNewSessionTransfer({ ctx, mode: "summary", rawArgs: commandArgs });
		},
	});

	pi.registerCommand("handoff", {
		description: "Create a new normal Pi session from a generated handoff packet of the current one",
		handler: async (commandArgs, ctx) => {
			await runNewSessionTransfer({ ctx, mode: "handoff", rawArgs: commandArgs });
		},
	});

	pi.registerCommand("team:status", {
		description: "Show a live overlay of teammate activity for the current session",
		handler: async (_args, ctx) => {
			await showTeammateStatusOverlay({
				ctx,
				onResume: async (sessionId) => {
					const runtimeConfig = loadTeammatesConfig(ctx.cwd).config.teammates;
					const job = findTeammateJob(ctx.sessionManager.getEntries(), sessionId);
					if (!job) {
						ctx.ui.notify(`No teammate session found for ${sessionId}`, "warning");
						return;
					}
					const result = await resumeTeammateSession({
						job,
						signal: ctx.signal,
						onUpdate: undefined,
						makeDetails: (results) => ({
							mode: "single",
							projectTeammatesDir: null,
							collapsedItemCount: runtimeConfig.collapsedItemCount,
							results,
						}),
						modelRegistry: ctx.modelRegistry,
						appendJobRecord: (record) => pi.appendEntry(TEAMMATE_JOB_CUSTOM_TYPE, record),
					});
					pi.sendMessage({
						customType: "pi-teammates/manual-delegate",
						content: buildManualDelegationTranscript({
							commandName: "team:status",
							teammateName: job.teammateName,
							contextMode: job.contextMode,
							task: job.task,
							sessionId: result.sessionId,
							model: result.model,
							resultText: getResultOutput(result),
							status: result.status ?? (isFailedResult(result) ? "failed" : "completed"),
						}),
						display: true,
						details: { command: "team:status", teammate: job.teammateName, sessionId },
					}, { triggerTurn: false });
					ctx.ui.notify(
						isFailedResult(result) ? `Resume failed: ${sessionId}` : `Resume finished: ${sessionId}`,
						isFailedResult(result) ? "warning" : "info",
					);
				},
			});
		},
	});

	pi.registerCommand("team:eject", {
		description: "Copy builtin teammate templates into project or user scope as editable teammate files",
		handler: async (commandArgs, ctx) => {
			const tokens = commandArgs.split(/\s+/).map((token) => token.trim()).filter(Boolean);
			const overwrite = tokens.includes("--overwrite");
			const explicitScope = tokens.find((token): token is BuiltinEjectScope => token === "project" || token === "user");
			const selectedScope = explicitScope ?? await ctx.ui.select("Eject builtin teammates to which scope?", ["project", "user"]);
			if (selectedScope !== "project" && selectedScope !== "user") return;
			const result = await ejectBuiltinTeammates({ cwd: ctx.cwd, scope: selectedScope, overwrite });
			const skippedNote = result.skipped.length > 0 ? `, skipped ${result.skipped.length} existing file(s)` : "";
			ctx.ui.notify(`Ejected ${result.created.length} builtin teammate(s) to ${result.targetDir}${skippedNote}`, "info");
		},
	});

	pi.registerCommand("team:manage", {
		description: "Open an interactive teammate manager for creating, editing, duplicating, and deleting teammate files",
		handler: async (_args, ctx) => {
			await runTeammateManager(ctx);
		},
	});

	pi.registerTool({
		name: "delegate",
		label: "Delegate",
		description: [
			"Delegate bounded execution work to configured teammates in isolated Pi sessions.",
			"Use `tasks` (parallel array) whenever you have two or more independent subtasks — parallel runs all tasks concurrently at zero additional wall-clock cost and is the correct default for independent work.",
			"Use `chain` for sequential pipelines where each step uses `{previous}` output from the prior step.",
			"Use single (`teammate`+`task`) only for a single isolated subtask.",
			"Use it when specialization, a fresh context window, or parallelism will materially improve the result; do not use for vague requests or work you can complete inline without quality loss.",
			"`context` controls how much caller state each child receives: `new` = task only, `summary` = fresh session plus generated task-focused context summary, `handoff` = fresh session plus execution-oriented handoff packet, `inherit` = exact caller session clone.",
			"If `context` is omitted the teammate's configured default is used (`new` unless overridden in the teammate file).",
			"`resumeSessionId` resumes an interrupted teammate run; do not combine with new task parameters.",
			"Streams progress while running and returns each teammate's final output with session IDs for status and resume flows.",
		].join(" "),
		promptSnippet: "Delegate bounded execution work to configured teammates in isolated internal Pi sessions.",
		promptGuidelines: [
			"Decompose work before calling delegate: identify all independent workstreams and sequential dependencies, then batch them into one call — N independent tasks into one `tasks` call (parallel), a sequential pipeline into one `chain` call.",
			"Never make multiple sequential delegate calls for independent subtasks — use `tasks` instead. Sequential delegation wastes wall-clock time and is the most common misuse of this tool.",
			"If you are about to emit more than one delegate call for subtasks that do not depend on each other, collapse them into a single `tasks` call — multiple delegate calls in one turn for independent work is the same mistake as making them sequentially.",
			"Use `delegate` only after you have decided the actual subtask; delegate execution, not judgment — decide the real work yourself first.",
			"In every delegated task, include the concrete goal, relevant files or symbols, key constraints or risks, and the expected output format.",
			"Prefer `context=new` for self-contained tasks; use `context=summary` when the teammate needs broader session background; use `context=handoff` for one specific next-step execution brief; use `context=inherit` only when exact transcript continuity is truly required.",
			"In chain tasks, use `{previous}` deliberately: only include it when the step genuinely depends on the prior output — do not copy it by default.",
			"Use `resumeSessionId` only to continue an existing interrupted child session; do not combine with new task parameters.",
			"After a teammate returns, synthesize or route the result yourself — do not assume the child owns the overall conversation.",
		],
		parameters: DelegateParamsSchema,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const runtimeConfig = loadTeammatesConfig(ctx.cwd).config.teammates;
			const lineage = getLatestTeammateSessionState(ctx.sessionManager.getEntries())?.lineage ?? parseTeammatesLineage(process.env[TEAMMATES_LINEAGE_ENV]);
			const currentBranch = ctx.sessionManager.getBranch();
			const currentEntries = ctx.sessionManager.getEntries();
			const currentSessionId = ctx.sessionManager.getSessionId();
			const currentSessionDir = ctx.sessionManager.getSessionDir();
			const currentSessionFile = ctx.sessionManager.getSessionFile();
			const appendJobRecord = (record: TeammateJobRecord) => {
				pi.appendEntry(TEAMMATE_JOB_CUSTOM_TYPE, record);
			};
			const discovery = discoverTeammates(ctx.cwd, {
				loadProjectTeammates: runtimeConfig.loadProjectTeammates,
			});
			const activeTools = pi.getActiveTools();
			const teammates = discovery.teammates.filter((teammate) =>
				canDelegateToTeammate({ targetName: teammate.name, lineage }),
			);
			const discoveryWarningNote = discovery.warnings.length > 0
				? `\n\n[Warning: ${discovery.warnings.length} teammate file(s) skipped due to parse errors: ${discovery.warnings.join("; ")}]`
				: "";

			const hasChain = (params.chain?.length ?? 0) > 0;
			const hasTasks = (params.tasks?.length ?? 0) > 0;
			const hasSingle = Boolean(params.teammate && params.task);
			const hasResume = typeof params.resumeSessionId === "string" && params.resumeSessionId.trim().length > 0;
			const modeCount = Number(hasChain) + Number(hasTasks) + Number(hasSingle) + Number(hasResume);

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
							text: `Invalid parameters. Provide exactly one mode: single (teammate+task), parallel (tasks array), chain (chain array), or resume (resumeSessionId). Available teammates: ${formatAvailableTeammates(teammates)}${discoveryWarningNote}`,
						},
					],
					details: makeDetails("single")([]),
				};
			}

			if (hasResume) {
				const sessionId = params.resumeSessionId!.trim();
				const job = findTeammateJob(currentEntries, sessionId);
				if (!job) {
					return {
						content: [{ type: "text", text: `No teammate session found for resumeSessionId ${sessionId}.` }],
						details: makeDetails("single")([]),
					};
				}
				if (job.status === "completed") {
					return {
						content: [{ type: "text", text: `Teammate session ${sessionId} is already completed and cannot be resumed with continue().` }],
						details: makeDetails("single")([]),
					};
				}

				const result = await resumeTeammateSession({
					job,
					signal,
					onUpdate,
					makeDetails: makeDetails("single"),
					modelRegistry: ctx.modelRegistry,
					appendJobRecord,
				});

				if (isFailedResult(result)) {
					return {
						content: [{
							type: "text",
							text: prependResultMeta(result, `Resume failed: ${getResultOutput(result)}`),
						}],
						details: makeDetails("single")([result]),
					};
				}

				return {
					content: [{
						type: "text",
						text: prependResultMeta(result, getFinalOutput(result.messages) || "(no output)"),
					}],
					details: makeDetails("single")([result]),
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
						parentBranch: currentBranch,
						parentSessionId: currentSessionId,
						parentSessionDir: currentSessionDir,
						currentSessionFile,
						currentModel: ctx.model,
						modelRegistry: ctx.modelRegistry,
						appendJobRecord,
						contextOverride: params.context,
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
						const metaNote = [result.sessionId ? `session ${result.sessionId}` : "", result.model ? `model ${result.model}` : ""]
							.filter(Boolean)
							.join(", ");
						return {
							content: [{
								type: "text",
								text: `Chain stopped at step ${i + 1} (${step.teammate}${metaNote ? `, ${metaNote}` : ""}): ${errorMessage}`,
							}],
							details: makeDetails("chain")(results),
						};
					}
					previousOutput = getFinalOutput(result.messages);
				}

				return {
					content: [{
						type: "text",
						text: `${results.map((result) => formatChainResultLabel(result)).join("\n")}\n\n${getFinalOutput(results[results.length - 1].messages) || "(no output)"}`,
					}],
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
					const running = allResults.filter(isRunningResult).length;
					const done = allResults.filter(isFinishedResult).length;
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
							parentBranch: currentBranch,
							parentSessionId: currentSessionId,
							parentSessionDir: currentSessionDir,
							currentSessionFile,
							currentModel: ctx.model,
							modelRegistry: ctx.modelRegistry,
							appendJobRecord,
							contextOverride: params.context,
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
					const meta = [
						`Session: ${result.sessionId ?? "unknown"}`,
						result.model ? `Model: ${result.model}` : "",
					].filter(Boolean).join("\n");
					return `### [${result.teammate}] ${status}\n\n${meta}\n\n${output}`;
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
					parentBranch: currentBranch,
					parentSessionId: currentSessionId,
					parentSessionDir: currentSessionDir,
					currentSessionFile,
					currentModel: ctx.model,
					modelRegistry: ctx.modelRegistry,
					appendJobRecord,
					contextOverride: params.context,
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
						content: [{
							type: "text",
							text: prependResultMeta(result, `Teammate ${result.stopReason || "failed"}: ${errorMessage}`),
						}],
						details: makeDetails("single")([result]),
					};
				}
				return {
					content: [{
						type: "text",
						text: prependResultMeta(result, getFinalOutput(result.messages) || "(no output)"),
					}],
					details: makeDetails("single")([result]),
				};
			}

			return {
				content: [{ type: "text", text: `Invalid parameters. Available teammates: ${formatAvailableTeammates(teammates)}` }],
				details: makeDetails("single")([]),
			};
		},

		renderCall: renderDelegateCall,
		renderResult: renderDelegateResult,
	});
}
