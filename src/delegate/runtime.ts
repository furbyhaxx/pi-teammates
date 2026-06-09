import {
	createAgentSession,
	DefaultResourceLoader,
	getAgentDir,
	SettingsManager,
	type ModelRegistry,
	type SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { Model, ThinkingLevel } from "@earendil-works/pi-ai";
import { buildInjectedSkillsPrompt } from "../teammates/skills.ts";
import type { TeammatePromptMode } from "../teammates/types.ts";
import { formatResolvedModelLabel } from "./model.ts";
import { extractRunOutcome, getTrackableMessages } from "./run-outcome.ts";
import type { SingleResult } from "./types.ts";

type ChildSessionHandle = Awaited<ReturnType<typeof createAgentSession>>;

export interface ChildRuntimeSetupResult {
	sessionHandle: ChildSessionHandle;
	syncSnapshot: () => void;
	cleanup: () => void;
}

export async function createChildRuntime(args: {
	cwd: string;
	modelRegistry: ModelRegistry;
	sessionManager: SessionManager;
	toolNames: string[];
	disableAllTools: boolean;
	skills: string[];
	promptMode: TeammatePromptMode;
	systemPrompt: string;
	result: SingleResult;
	onEffectiveModelChange?: (model: string) => void;
	emitUpdate: () => void;
	signal: AbortSignal | undefined;
	includeModelOptions?: boolean;
	model?: Model<any> | undefined;
	thinkingLevel?: ThinkingLevel | undefined;
}): Promise<ChildRuntimeSetupResult> {
	let sessionHandle: ChildSessionHandle | undefined;
	let unsubscribe: (() => void) | undefined;
	let abortCleanup: (() => void) | undefined;

	const cleanup = () => {
		abortCleanup?.();
		unsubscribe?.();
		sessionHandle?.session.dispose();
	};

	try {
		const agentDir = getAgentDir();
		const childSettingsManager = SettingsManager.create(args.cwd, agentDir);
		const childResourceLoader = new DefaultResourceLoader({
			cwd: args.cwd,
			agentDir,
			settingsManager: childSettingsManager,
		});
		await childResourceLoader.reload();
		const injectedSkills = await buildInjectedSkillsPrompt({
			skillNames: args.skills,
			availableSkills: childResourceLoader.getSkills().skills,
		});
		if (injectedSkills.missing.length > 0) {
			args.result.stderr += `Missing teammate skills: ${injectedSkills.missing.join(", ")}\n`;
		}
		const promptSections = [args.systemPrompt, injectedSkills.prompt].filter((section) => section.trim().length > 0);
		const sessionResourceLoader = new DefaultResourceLoader({
			cwd: args.cwd,
			agentDir,
			settingsManager: childSettingsManager,
			systemPromptOverride: args.promptMode === "replace" ? () => promptSections.join("\n\n") : undefined,
			appendSystemPromptOverride:
				args.promptMode === "append" && promptSections.length > 0
					? (base) => [...base, ...promptSections]
					: undefined,
		});
		await sessionResourceLoader.reload();

		sessionHandle = await createAgentSession({
			cwd: args.cwd,
			agentDir,
			modelRegistry: args.modelRegistry,
			...(args.includeModelOptions ? { model: args.model, thinkingLevel: args.thinkingLevel } : {}),
			sessionManager: args.sessionManager,
			settingsManager: childSettingsManager,
			resourceLoader: sessionResourceLoader,
			tools: args.disableAllTools ? undefined : args.toolNames,
			noTools: args.disableAllTools ? "all" : undefined,
		});

		const childSession = sessionHandle.session;
		const updateEffectiveModel = () => {
			const resolvedModel = formatResolvedModelLabel(childSession.model, childSession.thinkingLevel);
			if (!resolvedModel) return;
			args.result.model = resolvedModel;
			args.onEffectiveModelChange?.(resolvedModel);
		};
		updateEffectiveModel();
		await childSession.bindExtensions({
			onError: (error) => {
				args.result.stderr += `Extension error (${error.extensionPath}): ${error.error}\n`;
			},
		});

		const syncSnapshot = () => {
			const snapshot = [...childSession.state.messages];
			if (childSession.state.streamingMessage?.role === "assistant") {
				snapshot.push(childSession.state.streamingMessage);
			}
			args.result.messages = getTrackableMessages(snapshot);
			const outcome = extractRunOutcome(args.result.messages);
			args.result.usage = outcome.usage;
			args.result.stopReason = outcome.stopReason;
			args.result.errorMessage = outcome.errorMessage;
			updateEffectiveModel();
			args.emitUpdate();
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

		return {
			sessionHandle,
			syncSnapshot,
			cleanup,
		};
	} catch (error) {
		cleanup();
		throw error;
	}
}
