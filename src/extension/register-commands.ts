import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildManualDelegationTranscript } from "../command-helpers.ts";
import { completeTeamDelegateArguments } from "../commands/completions.ts";
import { runEjectBuiltinCommand } from "../commands/eject.ts";
import { runManualTeammateDelegation } from "../commands/manual-delegate.ts";
import { runNewSessionTransfer } from "../commands/session-transfer.ts";
import { loadTeammatesConfig } from "../config.ts";
import { getResultOutput, isFailedResult } from "../delegate/output.ts";
import { resumeTeammateSession } from "../delegate/resume-runner.ts";
import {
	findTeammateJob,
	TEAMMATE_JOB_CUSTOM_TYPE,
} from "../job-registry.ts";
import { runTeammateManager } from "../manage-widget.ts";
import { showTeammateStatusOverlay } from "../status-widget.ts";

export function registerCommands(pi: ExtensionAPI): void {
	pi.registerCommand("team:delegate", {
		description: "Manually delegate a scoped task to a teammate while staying in the current session",
		getArgumentCompletions: completeTeamDelegateArguments,
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
			await runEjectBuiltinCommand(commandArgs, ctx);
		},
	});

	pi.registerCommand("team:manage", {
		description: "Open an interactive teammate manager for creating, editing, duplicating, and deleting teammate files",
		handler: async (_args, ctx) => {
			await runTeammateManager(ctx);
		},
	});
}
