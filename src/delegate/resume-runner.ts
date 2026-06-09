import * as path from "node:path";
import { SessionManager, type ModelRegistry } from "@earendil-works/pi-coding-agent";
import { updateTeammateJobRecord, type TeammateJobRecord } from "../job-registry.ts";
import { getFinalOutput } from "./output.ts";
import { extractRunOutcome } from "./run-outcome.ts";
import { createChildRuntime, type ChildRuntimeSetupResult } from "./runtime.ts";
import type { DelegateDetails, OnUpdateCallback, SingleResult } from "./types.ts";

export async function resumeTeammateSession(args: {
	job: TeammateJobRecord;
	signal: AbortSignal | undefined;
	onUpdate: OnUpdateCallback | undefined;
	makeDetails: (results: SingleResult[]) => DelegateDetails;
	modelRegistry: ModelRegistry;
	appendJobRecord: (record: TeammateJobRecord) => void;
}): Promise<SingleResult> {
	const result: SingleResult = {
		teammate: args.job.teammateName,
		teammateSource: args.job.source ?? "unknown",
		task: args.job.task,
		contextMode: args.job.contextMode,
		jobId: args.job.jobId,
		sessionId: args.job.childSessionId,
		sessionPath: args.job.childSessionPath,
		status: "running",
		exitCode: 0,
		messages: [],
		stderr: "",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
		model: args.job.model,
	};

	const emitUpdate = () => {
		if (!args.onUpdate) return;
		args.onUpdate({
			content: [{ type: "text", text: getFinalOutput(result.messages) || "(running...)" }],
			details: args.makeDetails([result]),
		});
		};

	let runtime: ChildRuntimeSetupResult | undefined;
	let currentJobRecord = args.job;
	const persistEffectiveModel = (model: string) => {
		if (currentJobRecord.model === model) return;
		currentJobRecord = updateTeammateJobRecord(currentJobRecord, currentJobRecord.status, { model });
		args.appendJobRecord(currentJobRecord);
	};

	try {
		const sessionDir = path.dirname(args.job.childSessionPath);
		const childSessionManager = SessionManager.open(args.job.childSessionPath, sessionDir);
		const childCwd = childSessionManager.getCwd();
		runtime = await createChildRuntime({
			cwd: childCwd,
			modelRegistry: args.modelRegistry,
			sessionManager: childSessionManager,
			toolNames: args.job.toolNames,
			disableAllTools: args.job.disableAllTools,
			skills: args.job.skills,
			promptMode: args.job.promptMode,
			systemPrompt: args.job.systemPrompt,
			result,
			onEffectiveModelChange: persistEffectiveModel,
			emitUpdate,
			signal: args.signal,
		});

		currentJobRecord = updateTeammateJobRecord(currentJobRecord, "running");
		args.appendJobRecord(currentJobRecord);
		const childSession = runtime.sessionHandle.session;
		await childSession.agent.continue();
		await childSession.agent.waitForIdle();
		runtime.syncSnapshot();

		const outcome = extractRunOutcome(result.messages);
		result.exitCode = outcome.exitCode;
		result.usage = outcome.usage;
		result.stopReason = outcome.stopReason;
		result.errorMessage = outcome.errorMessage;
		result.status = result.exitCode === 0 ? "completed" : result.stopReason === "aborted" ? "aborted" : "failed";
		currentJobRecord = updateTeammateJobRecord(currentJobRecord, result.status as any);
		args.appendJobRecord(currentJobRecord);
		return result;
	} catch (error) {
		result.exitCode = 1;
		result.status = "failed";
		result.stderr += `${error instanceof Error ? error.message : String(error)}`;
		args.appendJobRecord(updateTeammateJobRecord(currentJobRecord, "failed"));
		return result;
	} finally {
		runtime?.cleanup();
	}
}
