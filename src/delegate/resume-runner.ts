import * as path from "node:path";
import {
	createAgentSession,
	DefaultResourceLoader,
	getAgentDir,
	SessionManager,
	SettingsManager,
	type ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { updateTeammateJobRecord, type TeammateJobRecord } from "../job-registry.ts";
import { buildInjectedSkillsPrompt } from "../teammate-skills.ts";
import { formatResolvedModelLabel } from "./model.ts";
import { getFinalOutput } from "./output.ts";
import { extractRunOutcome, getTrackableMessages } from "./run-outcome.ts";
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

	let sessionHandle: Awaited<ReturnType<typeof createAgentSession>> | undefined;
	let unsubscribe: (() => void) | undefined;
	let abortCleanup: (() => void) | undefined;
	let currentJobRecord = args.job;

	try {
		const sessionDir = path.dirname(args.job.childSessionPath);
		const childSessionManager = SessionManager.open(args.job.childSessionPath, sessionDir);
		const childCwd = childSessionManager.getCwd();
		const agentDir = getAgentDir();
		const childSettingsManager = SettingsManager.create(childCwd, agentDir);
		const childResourceLoader = new DefaultResourceLoader({
			cwd: childCwd,
			agentDir,
			settingsManager: childSettingsManager,
		});
		await childResourceLoader.reload();
		const injectedSkills = await buildInjectedSkillsPrompt({
			skillNames: args.job.skills,
			availableSkills: childResourceLoader.getSkills().skills,
		});
		if (injectedSkills.missing.length > 0) {
			result.stderr += `Missing teammate skills: ${injectedSkills.missing.join(", ")}\n`;
		}
		const promptSections = [args.job.systemPrompt, injectedSkills.prompt].filter((section) => section.trim().length > 0);
		const sessionResourceLoader = new DefaultResourceLoader({
			cwd: childCwd,
			agentDir,
			settingsManager: childSettingsManager,
			systemPromptOverride: args.job.promptMode === "replace" ? () => promptSections.join("\n\n") : undefined,
			appendSystemPromptOverride:
				args.job.promptMode === "append" && promptSections.length > 0
					? (base) => [...base, ...promptSections]
					: undefined,
		});
		await sessionResourceLoader.reload();

		sessionHandle = await createAgentSession({
			cwd: childCwd,
			agentDir,
			modelRegistry: args.modelRegistry,
			sessionManager: childSessionManager,
			settingsManager: childSettingsManager,
			resourceLoader: sessionResourceLoader,
			tools: args.job.disableAllTools ? undefined : args.job.toolNames,
			noTools: args.job.disableAllTools ? "all" : undefined,
		});

		const childSession = sessionHandle.session;
		const updateEffectiveModel = () => {
			const resolvedModel = formatResolvedModelLabel(childSession.model, childSession.thinkingLevel);
			if (!resolvedModel) return;
			result.model = resolvedModel;
			if (currentJobRecord.model !== resolvedModel) {
				currentJobRecord = updateTeammateJobRecord(currentJobRecord, currentJobRecord.status, { model: resolvedModel });
				args.appendJobRecord(currentJobRecord);
			}
		};
		updateEffectiveModel();
		await childSession.bindExtensions({
			onError: (error) => {
				result.stderr += `Extension error (${error.extensionPath}): ${error.error}\n`;
			},
		});

		const syncSnapshot = () => {
			const snapshot = [...childSession.state.messages];
			if (childSession.state.streamingMessage?.role === "assistant") {
				snapshot.push(childSession.state.streamingMessage);
			}
			result.messages = getTrackableMessages(snapshot);
			const outcome = extractRunOutcome(result.messages);
			result.usage = outcome.usage;
			result.stopReason = outcome.stopReason;
			result.errorMessage = outcome.errorMessage;
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

		currentJobRecord = updateTeammateJobRecord(currentJobRecord, "running");
		args.appendJobRecord(currentJobRecord);
		await childSession.agent.continue();
		await childSession.agent.waitForIdle();
		syncSnapshot();

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
		abortCleanup?.();
		unsubscribe?.();
		sessionHandle?.session.dispose();
	}
}
