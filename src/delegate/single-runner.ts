import {
	createAgentSession,
	DefaultResourceLoader,
	getAgentDir,
	SessionManager,
	SettingsManager,
	type ModelRegistry,
	type SessionEntry,
} from "@earendil-works/pi-coding-agent";
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
import { buildInjectedSkillsPrompt } from "../teammate-skills.ts";
import { createTeammateSessionState, TEAMMATE_STATE_CUSTOM_TYPE } from "../teammate-state.ts";
import type { TeammateConfig } from "../teammates.ts";
import { formatResolvedModelLabel, resolveTeammateModel } from "./model.ts";
import { getFinalOutput } from "./output.ts";
import { extractRunOutcome, getTrackableMessages } from "./run-outcome.ts";
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

	let sessionHandle: Awaited<ReturnType<typeof createAgentSession>> | undefined;
	let unsubscribe: (() => void) | undefined;
	let jobRecord: TeammateJobRecord | undefined;
	let abortCleanup: (() => void) | undefined;

	try {
		const agentDir = getAgentDir();
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

		const childSettingsManager = SettingsManager.create(childCwd, agentDir);
		const childResourceLoader = new DefaultResourceLoader({
			cwd: childCwd,
			agentDir,
			settingsManager: childSettingsManager,
		});
		await childResourceLoader.reload();
		const injectedSkills = await buildInjectedSkillsPrompt({
			skillNames: teammate.skills,
			availableSkills: childResourceLoader.getSkills().skills,
		});
		if (injectedSkills.missing.length > 0) {
			currentResult.stderr += `Missing teammate skills: ${injectedSkills.missing.join(", ")}\n`;
		}
		const promptSections = [teammate.systemPrompt, injectedSkills.prompt].filter((section) => section.trim().length > 0);
		const sessionResourceLoader = new DefaultResourceLoader({
			cwd: childCwd,
			agentDir,
			settingsManager: childSettingsManager,
			systemPromptOverride: teammate.promptMode === "replace" ? () => promptSections.join("\n\n") : undefined,
			appendSystemPromptOverride:
				teammate.promptMode === "append" && promptSections.length > 0
					? (base) => [...base, ...promptSections]
					: undefined,
		});
		await sessionResourceLoader.reload();

		sessionHandle = await createAgentSession({
			cwd: childCwd,
			agentDir,
			modelRegistry: args.modelRegistry,
			model: childModel,
			thinkingLevel,
			sessionManager: childSessionManager,
			settingsManager: childSettingsManager,
			resourceLoader: sessionResourceLoader,
			tools: disableAllTools ? undefined : resolvedTools,
			noTools: disableAllTools ? "all" : undefined,
		});

		const childSession = sessionHandle.session;
		const updateEffectiveModel = () => {
			const resolvedModel = formatResolvedModelLabel(childSession.model, childSession.thinkingLevel);
			if (!resolvedModel) return;
			currentResult.model = resolvedModel;
			if (jobRecord && jobRecord.model !== resolvedModel) {
				jobRecord = updateTeammateJobRecord(jobRecord, jobRecord.status, { model: resolvedModel });
				args.appendJobRecord(jobRecord);
			}
		};
		updateEffectiveModel();
		await childSession.bindExtensions({
			onError: (error) => {
				currentResult.stderr += `Extension error (${error.extensionPath}): ${error.error}\n`;
			},
		});

		const syncSnapshot = () => {
			const snapshot = [...childSession.state.messages];
			if (childSession.state.streamingMessage?.role === "assistant") {
				snapshot.push(childSession.state.streamingMessage);
			}
			currentResult.messages = getTrackableMessages(snapshot);
			const outcome = extractRunOutcome(currentResult.messages);
			currentResult.usage = outcome.usage;
			currentResult.stopReason = outcome.stopReason;
			currentResult.errorMessage = outcome.errorMessage;
			updateEffectiveModel();
			emitUpdate();
		};

		unsubscribe = childSession.subscribe((event) => {
			if (
				event.type === "message_start" ||
				event.type === "message_update" ||
				event.type === "message_end" ||
				event.type === "tool_execution_start" ||
				event.type === "tool_execution_update" ||
				event.type === "tool_execution_end"
			) {
				syncSnapshot();
			}
		});

		if (args.signal) {
			const abortChild = () => {
				void childSession.abort();
			};
			if (args.signal.aborted) abortChild();
			else args.signal.addEventListener("abort", abortChild, { once: true });
			abortCleanup = () => args.signal?.removeEventListener("abort", abortChild);
		}

		await childSession.prompt(delegatedTask);
		await childSession.agent.waitForIdle();
		syncSnapshot();

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
			args.appendJobRecord(updateTeammateJobRecord(jobRecord, currentResult.status as any));
		}

		return currentResult;
	} catch (error) {
		currentResult.exitCode = 1;
		currentResult.status = currentResult.status === "running" ? "failed" : currentResult.status;
		currentResult.stderr += `${error instanceof Error ? error.message : String(error)}`;
		if (jobRecord) {
			args.appendJobRecord(updateTeammateJobRecord(jobRecord, "failed"));
		}
		return currentResult;
	} finally {
		abortCleanup?.();
		unsubscribe?.();
		sessionHandle?.session.dispose();
	}
}
