import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { CommandContext } from "./types.ts";
import { loadTeammatesConfig } from "../config/load.ts";
import { selectContextMode, type TeammateContextMode } from "../context/modes.ts";
import {
	buildManualDelegationTranscript,
	improveDelegationTask,
	parseTeamCommandArgs,
} from "../command-helpers.ts";
import { getResultOutput, isFailedResult } from "../delegate/output.ts";
import { runSingleTeammate } from "../delegate/single-runner.ts";
import { parseTeammatesLineage, TEAMMATES_LINEAGE_ENV } from "../teammates/process.ts";
import { TEAMMATE_JOB_CUSTOM_TYPE, type TeammateJobRecord } from "../jobs/types.ts";
import { getLatestTeammateSessionState } from "../teammates/state.ts";
import { discoverTeammates } from "../teammates/discover.ts";

export async function runManualTeammateDelegation(args: {
	pi: ExtensionAPI;
	ctx: CommandContext;
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
