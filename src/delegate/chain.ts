import type { ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import type { TeammatesSettingsConfig } from "../config/types.ts";
import type { TeammateJobRecord } from "../jobs/types.ts";
import type { TeammateConfig } from "../teammates/types.ts";
import { runSingleTeammate } from "./single-runner.ts";
import {
	formatChainResultLabel,
	getFinalOutput,
	getResultOutput,
	isFailedResult,
} from "./output.ts";
import type { DelegateParams } from "./schema.ts";
import type { DelegateDetails, OnUpdateCallback, SingleResult } from "./types.ts";

export async function executeDelegateChain(args: {
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
	const results: SingleResult[] = [];
	let previousOutput = "";

	for (let i = 0; i < args.params.chain!.length; i++) {
		const step = args.params.chain![i];
		const taskWithContext = step.task.replace(/\{previous\}/g, previousOutput);
		const chainUpdate: OnUpdateCallback | undefined = args.onUpdate
			? (partial) => {
					const currentResult = partial.details?.results[0];
					if (!currentResult) return;
					args.onUpdate!({
						content: partial.content,
						details: args.makeDetails("chain")([...results, currentResult]),
					});
				}
			: undefined;

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
			teammateName: step.teammate,
			task: taskWithContext,
			cwd: step.cwd,
			step: i + 1,
			signal: args.signal,
			onUpdate: chainUpdate,
			makeDetails: args.makeDetails("chain"),
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
				details: args.makeDetails("chain")(results),
			};
		}
		previousOutput = getFinalOutput(result.messages);
	}

	return {
		content: [{
			type: "text",
			text: `${results.map((result) => formatChainResultLabel(result)).join("\n")}\n\n${getFinalOutput(results[results.length - 1].messages) || "(no output)"}`,
		}],
		details: args.makeDetails("chain")(results),
	};
}
