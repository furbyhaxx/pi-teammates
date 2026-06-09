import { SessionManager, type ModelRegistry, type SessionEntry } from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";
import {
	buildDelegatedUserTask,
	generateDelegationContext,
	selectContextMode,
	type TeammateContextMode,
} from "../context-transfer.ts";
import type { TeammatesSettingsConfig } from "../config.ts";
import { canDelegateToTeammate, resolveTeammateToolNames } from "../delegation-policy.ts";
import { createTeammateJobRecord, updateTeammateJobRecord, type TeammateJobRecord } from "../job-registry.ts";
import { createTeammateSessionState, TEAMMATE_STATE_CUSTOM_TYPE } from "../teammate-state.ts";
import type { TeammateConfig } from "../teammates.ts";
import { resolveTeammateModel } from "./model.ts";
import { getFinalOutput } from "./output.ts";
import { extractRunOutcome } from "./run-outcome.ts";
import { createChildRuntime, type ChildRuntimeSetupResult } from "./runtime.ts";
import { buildChildSessionDir, createJobId } from "./session-paths.ts";
import type { DelegateDetails, OnUpdateCallback, SingleResult } from "./types.ts";

export async function runSingleTeammate(args: {
	defaultCwd: string;
	runtimeConfig: TeammatesSettingsConfig;
	activeTools: string[];
	teammates: TeammateConfig[];
	lineage: string[];
	parentBranch: SessionEntry[];
	parentSessionId: string;
	parentSessionDir: string;
	currentSessionFile: string | undefined;
	currentModel: Model<any> | undefined;
	modelRegistry: ModelRegistry;
	appendJobRecord: (record: TeammateJobRecord) => void;
	contextOverride?: TeammateContextMode;
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

	const childCwd = args.cwd ?? args.defaultCwd;
	const resolvedTools = resolveTeammateToolNames({
		activeTools: args.activeTools,
		toolToggles: teammate.tools,
		toolAliases: args.runtimeConfig.toolAliases,
		delegateEnabled: teammate.tools?.delegate === true,
	});
	const disableAllTools = teammate.tools !== undefined && resolvedTools.length === 0;
	const contextMode = selectContextMode(args.contextOverride, teammate.contextMode);
	const currentResult: SingleResult = {
		teammate: teammate.name,
		teammateSource: teammate.source,
		task: args.task,
		contextMode,
		exitCode: 0,
		messages: [],
		stderr: "",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
		model: teammate.model,
		step: args.step,
	};

	const emitUpdate = () => {
		if (!args.onUpdate) return;
		args.onUpdate({
			content: [{ type: "text", text: getFinalOutput(currentResult.messages) || "(running...)" }],
			details: args.makeDetails([currentResult]),
		});
	};

	let runtime: ChildRuntimeSetupResult | undefined;
	let jobRecord: TeammateJobRecord | undefined;

	try {
		const childSessionDir = buildChildSessionDir(args.parentSessionDir, args.parentSessionId);
		const childSessionManager =
			contextMode === "inherit"
				? args.currentSessionFile
					? SessionManager.forkFrom(args.currentSessionFile, childCwd, childSessionDir, {
						parentSession: args.currentSessionFile,
					})
					: undefined
				: SessionManager.create(childCwd, childSessionDir, { parentSession: args.currentSessionFile });

		if (!childSessionManager) {
			return {
				...currentResult,
				exitCode: 1,
				stderr:
					"Inherited teammate context requires the invoking session to be persisted on disk. This session has no session file, so use context=new, summary, or handoff instead.",
			};
		}

		const childSessionId = childSessionManager.getSessionId();
		const childSessionPath = childSessionManager.getSessionFile();
		if (!childSessionPath) {
			return {
				...currentResult,
				exitCode: 1,
				stderr: "Failed to create persisted teammate session file.",
			};
		}

		childSessionManager.appendCustomEntry(
			TEAMMATE_STATE_CUSTOM_TYPE,
			createTeammateSessionState({
				teammateName: teammate.name,
				contextMode,
				lineage: [...args.lineage, teammate.name],
				parentSessionId: args.parentSessionId,
			}),
		);

		currentResult.sessionId = childSessionId;
		currentResult.sessionPath = childSessionPath;
		currentResult.status = "running";
		currentResult.jobId = createJobId();

		jobRecord = createTeammateJobRecord({
			jobId: currentResult.jobId,
			parentSessionId: args.parentSessionId,
			parentSessionFile: args.currentSessionFile,
			childSessionId,
			childSessionPath,
			teammateName: teammate.name,
			source: teammate.source,
			task: args.task,
			contextMode,
			cwd: childCwd,
			toolNames: resolvedTools,
			disableAllTools,
			skills: teammate.skills,
			promptMode: teammate.promptMode,
			systemPrompt: teammate.systemPrompt,
			status: "running",
			model: teammate.model,
		});
		args.appendJobRecord(jobRecord);

		const generatedContext =
			contextMode === "summary" || contextMode === "handoff"
				? await generateDelegationContext({
					mode: contextMode,
					task: args.task,
					branch: args.parentBranch,
					contextConfig: args.runtimeConfig.context,
					currentModel: args.currentModel,
					modelRegistry: args.modelRegistry,
					signal: args.signal,
				})
				: undefined;

		const delegatedTask = buildDelegatedUserTask({
			mode: contextMode,
			task: args.task,
			generatedContext,
		});

		const { model: childModel, thinkingLevel } = resolveTeammateModel({
			teammateModel: teammate.model,
			modelRegistry: args.modelRegistry,
			fallbackModel: args.currentModel,
		});

		runtime = await createChildRuntime({
			cwd: childCwd,
			modelRegistry: args.modelRegistry,
			model: childModel,
			thinkingLevel,
			includeModelOptions: true,
			sessionManager: childSessionManager,
			toolNames: resolvedTools,
			disableAllTools,
			skills: teammate.skills,
			promptMode: teammate.promptMode,
			systemPrompt: teammate.systemPrompt,
			result: currentResult,
			jobRecord,
			appendJobRecord: args.appendJobRecord,
			onJobRecordUpdate: (record) => {
				jobRecord = record;
			},
			emitUpdate,
			signal: args.signal,
		});

		const childSession = runtime.sessionHandle.session;
		await childSession.prompt(delegatedTask);
		await childSession.agent.waitForIdle();
		runtime.syncSnapshot();

		const outcome = extractRunOutcome(currentResult.messages);
		currentResult.exitCode = outcome.exitCode;
		currentResult.usage = outcome.usage;
		currentResult.stopReason = outcome.stopReason;
		currentResult.errorMessage = outcome.errorMessage;
		currentResult.status =
			currentResult.exitCode === 0
				? "completed"
				: currentResult.stopReason === "aborted"
					? "aborted"
					: "failed";

		if (jobRecord) {
			jobRecord = updateTeammateJobRecord(runtime.getJobRecord() ?? jobRecord, currentResult.status as any);
			args.appendJobRecord(jobRecord);
		}

		return currentResult;
	} catch (error) {
		currentResult.exitCode = 1;
		currentResult.status = currentResult.status === "running" ? "failed" : currentResult.status;
		currentResult.stderr += `${error instanceof Error ? error.message : String(error)}`;
		if (jobRecord) {
			args.appendJobRecord(updateTeammateJobRecord(runtime?.getJobRecord() ?? jobRecord, "failed"));
		}
		return currentResult;
	} finally {
		runtime?.cleanup();
	}
}
