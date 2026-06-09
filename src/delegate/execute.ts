import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";
import { loadTeammatesConfig } from "../config.ts";
import { canDelegateToTeammate } from "../delegation-policy.ts";
import { parseTeammatesLineage, TEAMMATES_LINEAGE_ENV } from "../delegate-process.ts";
import {
	collectLatestTeammateJobs,
	TEAMMATE_JOB_CUSTOM_TYPE,
	type TeammateJobRecord,
} from "../job-registry.ts";
import { getLatestTeammateSessionState } from "../teammate-state.ts";
import { discoverTeammates, type TeammateConfig } from "../teammates.ts";
import { executeDelegateChain } from "./chain.ts";
import {
	getFinalOutput,
	getResultOutput,
	isFailedResult,
	prependResultMeta,
} from "./output.ts";
import { executeDelegateParallel } from "./parallel.ts";
import { resumeTeammateSession } from "./resume-runner.ts";
import { runSingleTeammate } from "./single-runner.ts";
import type { DelegateDetails, DelegateParams, OnUpdateCallback, SingleResult } from "./types.ts";

export function findTeammateJob(sessionEntries: SessionEntry[], sessionId: string): TeammateJobRecord | undefined {
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

export async function executeDelegateTool(args: {
	pi: ExtensionAPI;
	params: DelegateParams;
	signal: AbortSignal | undefined;
	onUpdate: OnUpdateCallback | undefined;
	ctx: any;
}): Promise<AgentToolResult<DelegateDetails>> {
	const runtimeConfig = loadTeammatesConfig(args.ctx.cwd).config.teammates;
	const lineage = getLatestTeammateSessionState(args.ctx.sessionManager.getEntries())?.lineage ?? parseTeammatesLineage(process.env[TEAMMATES_LINEAGE_ENV]);
	const currentBranch = args.ctx.sessionManager.getBranch();
	const currentEntries = args.ctx.sessionManager.getEntries();
	const currentSessionId = args.ctx.sessionManager.getSessionId();
	const currentSessionDir = args.ctx.sessionManager.getSessionDir();
	const currentSessionFile = args.ctx.sessionManager.getSessionFile();
	const appendJobRecord = (record: TeammateJobRecord) => {
		args.pi.appendEntry(TEAMMATE_JOB_CUSTOM_TYPE, record);
	};
	const discovery = discoverTeammates(args.ctx.cwd, {
		loadProjectTeammates: runtimeConfig.loadProjectTeammates,
	});
	const activeTools = args.pi.getActiveTools();
	const teammates = discovery.teammates.filter((teammate) =>
		canDelegateToTeammate({ targetName: teammate.name, lineage }),
	);
	const discoveryWarningNote = discovery.warnings.length > 0
		? `\n\n[Warning: ${discovery.warnings.length} teammate file(s) skipped due to parse errors: ${discovery.warnings.join("; ")}]`
		: "";

	const hasChain = (args.params.chain?.length ?? 0) > 0;
	const hasTasks = (args.params.tasks?.length ?? 0) > 0;
	const hasSingle = Boolean(args.params.teammate && args.params.task);
	const hasResume = typeof args.params.resumeSessionId === "string" && args.params.resumeSessionId.trim().length > 0;
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
		const sessionId = args.params.resumeSessionId!.trim();
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
			signal: args.signal,
			onUpdate: args.onUpdate,
			makeDetails: makeDetails("single"),
			modelRegistry: args.ctx.modelRegistry,
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

	const blockedTeammates = collectRequestedTeammates(args.params).filter(
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

	if (args.params.chain && args.params.chain.length > 0) {
		return executeDelegateChain({
			params: args.params,
			ctx: args.ctx,
			runtimeConfig,
			activeTools,
			teammates,
			lineage,
			currentBranch,
			currentSessionId,
			currentSessionDir,
			currentSessionFile,
			appendJobRecord,
			onUpdate: args.onUpdate,
			signal: args.signal,
			makeDetails,
		});
	}

	if (args.params.tasks && args.params.tasks.length > 0) {
		return executeDelegateParallel({
			params: args.params,
			ctx: args.ctx,
			runtimeConfig,
			activeTools,
			teammates,
			lineage,
			currentBranch,
			currentSessionId,
			currentSessionDir,
			currentSessionFile,
			appendJobRecord,
			onUpdate: args.onUpdate,
			signal: args.signal,
			makeDetails,
		});
	}

	if (args.params.teammate && args.params.task) {
		const result = await runSingleTeammate({
			defaultCwd: args.ctx.cwd,
			runtimeConfig,
			activeTools,
			teammates,
			lineage,
			parentBranch: currentBranch,
			parentSessionId: currentSessionId,
			parentSessionDir: currentSessionDir,
			currentSessionFile,
			currentModel: args.ctx.model,
			modelRegistry: args.ctx.modelRegistry,
			appendJobRecord,
			contextOverride: args.params.context,
			teammateName: args.params.teammate,
			task: args.params.task,
			cwd: args.params.cwd,
			step: undefined,
			signal: args.signal,
			onUpdate: args.onUpdate,
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
}
