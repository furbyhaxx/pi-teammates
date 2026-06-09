import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ejectBuiltinTeammates, type BuiltinEjectScope } from "./builtin-teammates.ts";
import { loadTeammatesConfig } from "./config.ts";
import {
	buildDelegatedUserTask,
	generateDelegationContext,
	selectContextMode,
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
import { getResultOutput, isFailedResult } from "./delegate/output.ts";
import { resumeTeammateSession } from "./delegate/resume-runner.ts";
import { runSingleTeammate } from "./delegate/single-runner.ts";
import { parseTeammatesLineage, TEAMMATES_LINEAGE_ENV } from "./delegate-process.ts";
import { registerTools } from "./extension/register-tools.ts";
import {
	collectInterruptedTeammateJobs,
	findTeammateJob,
	TEAMMATE_JOB_CUSTOM_TYPE,
	type TeammateJobRecord,
	updateTeammateJobRecord,
} from "./job-registry.ts";
import { runTeammateManager } from "./manage-widget.ts";
import { showTeammateStatusOverlay } from "./status-widget.ts";
import {
	getLatestTeammateSessionState,
} from "./teammate-state.ts";
import { discoverTeammates } from "./teammates.ts";

export { formatResolvedModelLabel } from "./delegate/model.ts";

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

	registerTools(pi);
}
