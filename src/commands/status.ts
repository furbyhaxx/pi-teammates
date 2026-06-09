import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildManualDelegationTranscript } from "../command-helpers.ts";
import { loadTeammatesConfig } from "../config/load.ts";
import { getResultOutput, isFailedResult } from "../delegate/output.ts";
import { resumeTeammateSession } from "../delegate/resume-runner.ts";
import { findTeammateJob } from "../jobs/queries.ts";
import { TEAMMATE_JOB_CUSTOM_TYPE } from "../jobs/types.ts";
import { showTeammateStatusOverlay } from "../ui/status/index.ts";
import type { CommandContext } from "./types.ts";

export async function runStatusCommand(args: {
	pi: ExtensionAPI;
	ctx: CommandContext;
}): Promise<void> {
	const { pi, ctx } = args;
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
}
