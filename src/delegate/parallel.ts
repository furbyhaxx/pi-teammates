import type { ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import type { TeammatesSettingsConfig } from "../config/types.ts";
import type { TeammateJobRecord } from "../jobs/types.ts";
import { mapWithConcurrencyLimit } from "../shared/concurrency.ts";
import type { TeammateConfig } from "../teammates/types.ts";
import {
	getResultOutput,
	isFailedResult,
	isFinishedResult,
	isRunningResult,
	truncateParallelOutput,
} from "./output.ts";
import { runSingleTeammate } from "./single-runner.ts";
import type { DelegateParams } from "./schema.ts";
import type { DelegateDetails, OnUpdateCallback, SingleResult } from "./types.ts";

export async function executeDelegateParallel(args: {
	params: DelegateParams;
	ctx: ExtensionContext;
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
}): Promise<{ content: Array<{ type: "text"; text: string }>; details: DelegateDetails }> {
	if (args.params.tasks!.length > args.runtimeConfig.maxParallelTasks) {
		return {
			content: [
				{
					type: "text",
					text: `Too many parallel tasks (${args.params.tasks!.length}). Max is ${args.runtimeConfig.maxParallelTasks}.`,
				},
			],
			details: args.makeDetails("parallel")([]),
		};
	}

	const allResults: SingleResult[] = new Array(args.params.tasks!.length);
	for (let i = 0; i < args.params.tasks!.length; i++) {
		allResults[i] = {
			teammate: args.params.tasks![i].teammate,
			teammateSource: "unknown",
			task: args.params.tasks![i].task,
			exitCode: -1,
			messages: [],
			stderr: "",
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
		};
	}

	const emitParallelUpdate = () => {
		if (!args.onUpdate) return;
		const running = allResults.filter(isRunningResult).length;
		const done = allResults.filter(isFinishedResult).length;
		args.onUpdate({
			content: [{ type: "text", text: `Parallel: ${done}/${allResults.length} done, ${running} running...` }],
			details: args.makeDetails("parallel")([...allResults]),
		});
	};

	const results = await mapWithConcurrencyLimit(
		args.params.tasks!,
		args.runtimeConfig.maxConcurrency,
		async (taskItem, index) => {
			const result = await runSingleTeammate({
				defaultCwd: args.ctx.cwd,
				runtimeConfig: args.runtimeConfig,
				activeTools: args.activeTools,
				teammates: args.teammates,
				lineage: args.lineage,
				parentBranch: args.currentBranch,
				parentSessionId: args.currentSessionId,
				parentSessionDir: args.currentSessionDir,
				currentSessionFile: args.currentSessionFile,
				currentModel: args.ctx.model,
				modelRegistry: args.ctx.modelRegistry,
				appendJobRecord: args.appendJobRecord,
				contextOverride: args.params.context,
				teammateName: taskItem.teammate,
				task: taskItem.task,
				cwd: taskItem.cwd,
				step: undefined,
				signal: args.signal,
				onUpdate: (partial) => {
					if (!partial.details?.results[0]) return;
					allResults[index] = partial.details.results[0];
					emitParallelUpdate();
				},
				makeDetails: args.makeDetails("parallel"),
			});
			allResults[index] = result;
			emitParallelUpdate();
			return result;
		},
	);

	const successCount = results.filter((result) => !isFailedResult(result)).length;
	const summaries = results.map((result) => {
		const output = truncateParallelOutput(getResultOutput(result), args.runtimeConfig.perTaskOutputCap);
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
		details: args.makeDetails("parallel")(results),
	};
}
