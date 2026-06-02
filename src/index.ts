import * as os from "node:os";
import * as path from "node:path";
import type { AgentMessage, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Message, Model, ThinkingLevel } from "@earendil-works/pi-ai";
import { StringEnum } from "@earendil-works/pi-ai";
import {
	createAgentSession,
	DefaultResourceLoader,
	type ExtensionAPI,
	getAgentDir,
	getMarkdownTheme,
	type ModelRegistry,
	SessionManager,
	type SessionEntry,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { loadTeammatesConfig, type TeammatesSettingsConfig } from "./config.ts";
import {
	buildDelegatedUserTask,
	generateDelegationContext,
	parseContextModelRef,
	selectContextMode,
	TEAMMATE_CONTEXT_MODES,
	type TeammateContextMode,
} from "./context-transfer.ts";
import {
	buildManualDelegationTranscript,
	defaultNewSessionTask,
	improveDelegationTask,
	parseTeamCommandArgs,
} from "./command-helpers.ts";
import {
	buildTeamPromptBlock,
	canDelegateToTeammate,
	resolveTeammateToolNames,
} from "./delegation-policy.ts";
import { parseTeammatesLineage, TEAMMATES_LINEAGE_ENV } from "./delegate-process.ts";
import {
	collectInterruptedTeammateJobs,
	collectLatestTeammateJobs,
	createTeammateJobRecord,
	TEAMMATE_JOB_CUSTOM_TYPE,
	type TeammateJobRecord,
	updateTeammateJobRecord,
} from "./job-registry.ts";
import { runTeammateManager } from "./manage-widget.ts";
import { showTeammateStatusOverlay } from "./status-widget.ts";
import { buildInjectedSkillsPrompt } from "./teammate-skills.ts";
import {
	createTeammateSessionState,
	getLatestTeammateSessionState,
	TEAMMATE_STATE_CUSTOM_TYPE,
} from "./teammate-state.ts";
import { discoverTeammates, type TeammateConfig } from "./teammates.ts";

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1000000).toFixed(1)}M`;
}

function formatUsageStats(
	usage: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		cost: number;
		contextTokens?: number;
		turns?: number;
	},
	model?: string,
): string {
	const parts: string[] = [];
	if (usage.turns) parts.push(`${usage.turns} turn${usage.turns > 1 ? "s" : ""}`);
	const totalTokens = (usage.contextTokens && usage.contextTokens > 0)
		? usage.contextTokens
		: usage.input + usage.output + usage.cacheRead;
	if (totalTokens > 0) parts.push(`${formatTokens(totalTokens)} tokens`);
	if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
	if (model) parts.push(model);
	return parts.join(" · ");
}

export function formatResolvedModelLabel(
	model: { provider: string; id: string } | undefined,
	thinkingLevel: ThinkingLevel | "off" | undefined,
): string | undefined {
	if (!model) return undefined;
	return thinkingLevel ? `${model.provider}/${model.id}:${thinkingLevel}` : `${model.provider}/${model.id}`;
}

function formatToolCall(
	toolName: string,
	args: Record<string, unknown>,
	themeFg: (color: any, text: string) => string,
): string {
	const shortenPath = (targetPath: string) => {
		const home = os.homedir();
		return targetPath.startsWith(home) ? `~${targetPath.slice(home.length)}` : targetPath;
	};

	const call = (label: string, arg: string) =>
		themeFg("accent", label) + themeFg("muted", "(") + themeFg("toolOutput", arg) + themeFg("muted", ")");

	switch (toolName) {
		case "bash":
		case "shell_exec": {
			const command = ((args.command as string) || (args.cmd as string) || "…") as string;
			const preview = command.length > 60 ? `${command.slice(0, 60)}…` : command;
			return call("Bash", preview);
		}
		case "shell_write_stdin": {
			const sessionId = String(args.session_id ?? "?");
			const chars = typeof args.chars === "string" ? args.chars : "";
			if (!chars) return themeFg("accent", "Bash") + themeFg("muted", `(poll session ${sessionId})`);
			const preview = chars.length > 32 ? `${chars.slice(0, 32)}…` : chars;
			return call("Bash", `stdin ${sessionId} ${preview}`);
		}
		case "shell_kill_session": {
			const sessionId = String(args.session_id ?? "?");
			const signal = typeof args.signal === "string" ? ` ${args.signal}` : "";
			return call("Bash", `kill ${sessionId}${signal}`);
		}
		case "shell_list_sessions": {
			return themeFg("accent", "Bash") + themeFg("muted", "(list sessions)");
		}
		case "read": {
			const rawPath = (args.file_path || args.path || "…") as string;
			const filePath = shortenPath(rawPath);
			const offset = args.offset as number | undefined;
			const limit = args.limit as number | undefined;
			let arg = filePath;
			if (offset !== undefined || limit !== undefined) {
				const startLine = offset ?? 1;
				const endLine = limit !== undefined ? startLine + limit - 1 : "";
				arg += `:${startLine}${endLine ? `-${endLine}` : ""}`;
			}
			return call("Read", arg);
		}
		case "write": {
			const rawPath = (args.file_path || args.path || "…") as string;
			const filePath = shortenPath(rawPath);
			const content = (args.content || "") as string;
			const lines = content.split("\n").length;
			const arg = lines > 1 ? `${filePath}, ${lines} lines` : filePath;
			return call("Write", arg);
		}
		case "edit": {
			const rawPath = (args.file_path || args.path || "…") as string;
			return call("Edit", shortenPath(rawPath));
		}
		case "ls": {
			const rawPath = (args.path || ".") as string;
			return call("LS", shortenPath(rawPath));
		}
		case "find": {
			const pattern = (args.pattern || "*") as string;
			const rawPath = (args.path || ".") as string;
			return call("Find", `${pattern} in ${shortenPath(rawPath)}`);
		}
		case "grep": {
			const pattern = (args.pattern || "") as string;
			const rawPath = (args.path || ".") as string;
			return call("Grep", `/${pattern}/ in ${shortenPath(rawPath)}`);
		}
		default: {
			const argsStr = JSON.stringify(args);
			const preview = argsStr.length > 50 ? `${argsStr.slice(0, 50)}…` : argsStr;
			const label = toolName.charAt(0).toUpperCase() + toolName.slice(1);
			return call(label, preview);
		}
	}
}

interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

interface SingleResult {
	teammate: string;
	teammateSource: "user" | "project" | "unknown";
	task: string;
	contextMode?: TeammateContextMode;
	jobId?: string;
	sessionId?: string;
	sessionPath?: string;
	status?: string;
	exitCode: number;
	messages: Message[];
	stderr: string;
	usage: UsageStats;
	model?: string;
	stopReason?: string;
	errorMessage?: string;
	step?: number;
}

interface DelegateDetails {
	mode: "single" | "parallel" | "chain";
	projectTeammatesDir: string | null;
	collapsedItemCount: number;
	results: SingleResult[];
}

function getFinalOutput(messages: Message[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (message.role === "assistant") {
			for (const part of message.content) {
				if (part.type === "text") return part.text;
			}
		}
	}
	return "";
}

function isFailedResult(result: SingleResult): boolean {
	return result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted";
}

function getResultOutput(result: SingleResult): string {
	if (isFailedResult(result)) {
		return result.errorMessage || result.stderr || getFinalOutput(result.messages) || "(no output)";
	}
	return getFinalOutput(result.messages) || "(no output)";
}

function formatResultMetaLines(result: Pick<SingleResult, "sessionId" | "model">): string[] {
	const lines: string[] = [];
	if (result.sessionId) lines.push(`Session: ${result.sessionId}`);
	if (result.model) lines.push(`Model: ${result.model}`);
	return lines;
}

function prependResultMeta(result: Pick<SingleResult, "sessionId" | "model">, body: string): string {
	const meta = formatResultMetaLines(result);
	if (meta.length === 0) return body;
	return body.trim().length > 0 ? `${meta.join("\n")}\n\n${body}` : meta.join("\n");
}

function formatChainResultLabel(result: Pick<SingleResult, "teammate" | "sessionId" | "model">): string {
	let label = `${result.teammate}: ${result.sessionId ?? "unknown"}`;
	if (result.model) label += ` [${result.model}]`;
	return label;
}

function truncateParallelOutput(output: string, maxBytes: number): string {
	const byteLength = Buffer.byteLength(output, "utf8");
	if (byteLength <= maxBytes) return output;

	let truncated = output.slice(0, maxBytes);
	while (Buffer.byteLength(truncated, "utf8") > maxBytes) {
		truncated = truncated.slice(0, -1);
	}
	return `${truncated}\n\n[Output truncated: ${byteLength - Buffer.byteLength(truncated, "utf8")} bytes omitted. Full output preserved in tool details.]`;
}

type DisplayItem = { type: "text"; text: string } | { type: "toolCall"; name: string; args: Record<string, any> };

function getDisplayItems(messages: Message[]): DisplayItem[] {
	const items: DisplayItem[] = [];
	for (const message of messages) {
		if (message.role === "assistant") {
			for (const part of message.content) {
				if (part.type === "text") items.push({ type: "text", text: part.text });
				else if (part.type === "toolCall") items.push({ type: "toolCall", name: part.name, args: part.arguments });
			}
		}
	}
	return items;
}

async function mapWithConcurrencyLimit<TIn, TOut>(
	items: TIn[],
	concurrency: number,
	fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
	if (items.length === 0) return [];
	const limit = Math.max(1, Math.min(concurrency, items.length));
	const results: TOut[] = new Array(items.length);
	let nextIndex = 0;
	const workers = new Array(limit).fill(null).map(async () => {
		while (true) {
			const current = nextIndex++;
			if (current >= items.length) return;
			results[current] = await fn(items[current], current);
		}
	});
	await Promise.all(workers);
	return results;
}

function buildChildSessionDir(parentSessionDir: string, parentSessionId: string): string {
	return path.join(parentSessionDir, parentSessionId);
}

function createJobId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getTrackableMessages(messages: AgentMessage[]): Message[] {
	return messages.filter((message) => message.role === "assistant" || message.role === "toolResult") as Message[];
}

function resolveTeammateModel(args: {
	teammateModel: string | undefined;
	modelRegistry: ModelRegistry;
	fallbackModel: Model<any> | undefined;
}): { model: Model<any> | undefined; thinkingLevel: ThinkingLevel | undefined } {
	if (!args.teammateModel || args.teammateModel.trim() === "") {
		return { model: args.fallbackModel, thinkingLevel: undefined };
	}
	const parsed = parseContextModelRef(args.teammateModel, args.fallbackModel?.provider);
	if (!parsed) {
		throw new Error(`Invalid teammate model reference: ${args.teammateModel}`);
	}
	const model = args.modelRegistry.find(parsed.provider, parsed.id);
	if (!model) {
		throw new Error(`Configured teammate model not found: ${parsed.provider}/${parsed.id}`);
	}
	return { model, thinkingLevel: parsed.thinking };
}

function extractRunOutcome(messages: Message[]): { exitCode: number; stopReason?: string; errorMessage?: string; usage: UsageStats } {
	const usage: UsageStats = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 };
	let stopReason: string | undefined;
	let errorMessage: string | undefined;

	for (const message of messages) {
		if (message.role !== "assistant") continue;
		usage.turns++;
		const msgUsage = message.usage;
		if (msgUsage) {
			usage.input += msgUsage.input || 0;
			usage.output += msgUsage.output || 0;
			usage.cacheRead += msgUsage.cacheRead || 0;
			usage.cacheWrite += msgUsage.cacheWrite || 0;
			usage.cost += msgUsage.cost?.total || 0;
			usage.contextTokens = msgUsage.totalTokens || usage.contextTokens;
		}
		stopReason = message.stopReason ?? stopReason;
		errorMessage = message.errorMessage ?? errorMessage;
	}

	return {
		exitCode: stopReason === "error" || stopReason === "aborted" ? 1 : 0,
		stopReason,
		errorMessage,
		usage,
	};
}

type OnUpdateCallback = (partial: AgentToolResult<DelegateDetails>) => void;

async function runSingleTeammate(args: {
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

async function resumeTeammateSession(args: {
	runtimeConfig: TeammatesSettingsConfig;
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

function findTeammateJob(sessionEntries: SessionEntry[], sessionId: string): TeammateJobRecord | undefined {
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

const TaskItem = Type.Object({
	teammate: Type.String({ description: "Name of the teammate to invoke" }),
	task: Type.String({ description: "Task to delegate to the teammate" }),
	cwd: Type.Optional(Type.String({ description: "Working directory for the teammate process" })),
});

const ChainItem = Type.Object({
	teammate: Type.String({ description: "Name of the teammate to invoke" }),
	task: Type.String({ description: "Task with optional {previous} placeholder for prior output" }),
	cwd: Type.Optional(Type.String({ description: "Working directory for the teammate process" })),
});

const ContextModeSchema = StringEnum(TEAMMATE_CONTEXT_MODES, {
	description:
		"Context strategy override for this delegate call. new = task only (default, use for self-contained tasks). summary = fresh session plus a generated task-focused context summary (use when the teammate needs session background). handoff = fresh session plus a generated execution-oriented handoff packet (use for one specific next-step task). inherit = exact caller session clone (use only when transcript continuity is truly required). Omit to use the teammate's configured default, which is shown in the <team> block.",
});

const DelegateParamsSchema = Type.Object({
	resumeSessionId: Type.Optional(Type.String({ description: "Resume a previously started teammate session by its returned session id." })),
	teammate: Type.Optional(Type.String({ description: "Name of the teammate to invoke (single mode)" })),
	task: Type.Optional(Type.String({ description: "Task to delegate (single mode)" })),
	tasks: Type.Optional(Type.Array(TaskItem, { description: "Parallel teammate tasks" })),
	chain: Type.Optional(Type.Array(ChainItem, { description: "Sequential teammate chain" })),
	context: Type.Optional(ContextModeSchema),
	cwd: Type.Optional(Type.String({ description: "Working directory for the teammate process (single mode)" })),
});

type DelegateParams = {
	resumeSessionId?: string;
	teammate?: string;
	task?: string;
	tasks?: Array<{ teammate: string; task: string; cwd?: string }>;
	chain?: Array<{ teammate: string; task: string; cwd?: string }>;
	context?: TeammateContextMode;
	cwd?: string;
};

async function runManualTeammateDelegation(args: {
	pi: ExtensionAPI;
	ctx: Parameters<NonNullable<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>>[1];
	commandName: "team:delegate" | "team:handoff";
	forcedContext?: TeammateContextMode;
	rawArgs: string;
}): Promise<void> {
	const parsed = parseTeamCommandArgs(args.rawArgs);
	const runtimeConfig = loadTeammatesConfig(args.ctx.cwd).config.teammates;
	const discovery = discoverTeammates(args.ctx.cwd, {
		loadProjectTeammates: runtimeConfig.loadProjectTeammates,
	});
	const teammateNames = discovery.teammates.map((teammate) => teammate.name);
	let teammateName = parsed.agent;
	if (!teammateName) {
		teammateName = await args.ctx.ui.select("Select teammate", teammateNames);
	}
	if (!teammateName) return;

	const teammate = discovery.teammates.find((candidate) => candidate.name === teammateName);
	if (!teammate) {
		args.ctx.ui.notify(`Unknown teammate: ${teammateName}`, "error");
		return;
	}

	let task = parsed.task;
	if (!task) {
		const entered = await args.ctx.ui.input("Delegated task", "Describe the task to offload");
		if (!entered?.trim()) return;
		task = entered.trim();
	}

	const selectedContext = selectContextMode(args.forcedContext, teammate.contextMode);
	if (parsed.improve) {
		if (!args.ctx.model) {
			args.ctx.ui.notify("No current session model available for --improve", "error");
			return;
		}
		const currentThinkingLevel = args.pi.getThinkingLevel();
		const improved = await improveDelegationTask({
			rawTask: task,
			branch: args.ctx.sessionManager.getBranch(),
			model: args.ctx.model,
			modelRegistry: args.ctx.modelRegistry,
			contextLabel: selectedContext,
			signal: args.ctx.signal,
			thinkingLevel: currentThinkingLevel === "off" ? undefined : currentThinkingLevel,
		});
		const edited = await args.ctx.ui.editor("Review delegated task", improved);
		if (!edited?.trim()) return;
		task = edited.trim();
	}

	const lineages = getLatestTeammateSessionState(args.ctx.sessionManager.getEntries())?.lineage ?? parseTeammatesLineage(process.env[TEAMMATES_LINEAGE_ENV]);
	const appendJobRecord = (record: TeammateJobRecord) => {
		args.pi.appendEntry(TEAMMATE_JOB_CUSTOM_TYPE, record);
	};
	args.ctx.ui.setStatus("team-command", `Delegating to ${teammateName}...`);
	const result = await runSingleTeammate({
		defaultCwd: args.ctx.cwd,
		runtimeConfig,
		activeTools: args.pi.getActiveTools(),
		teammates: discovery.teammates,
		lineage: lineages,
		parentBranch: args.ctx.sessionManager.getBranch(),
		parentSessionId: args.ctx.sessionManager.getSessionId(),
		parentSessionDir: args.ctx.sessionManager.getSessionDir(),
		currentSessionFile: args.ctx.sessionManager.getSessionFile(),
		currentModel: args.ctx.model,
		modelRegistry: args.ctx.modelRegistry,
		appendJobRecord,
		contextOverride: selectedContext,
		teammateName,
		task,
		cwd: undefined,
		step: undefined,
		signal: args.ctx.signal,
		onUpdate: undefined,
		makeDetails: (results) => ({
			mode: "single",
			projectTeammatesDir: discovery.projectTeammatesDir,
			collapsedItemCount: runtimeConfig.collapsedItemCount,
			results,
		}),
	});
	args.ctx.ui.setStatus("team-command", undefined);

	const transcript = buildManualDelegationTranscript({
		commandName: args.commandName,
		teammateName,
		contextMode: result.contextMode ?? selectedContext,
		task,
		sessionId: result.sessionId,
		model: result.model,
		resultText: getResultOutput(result),
		status: result.status ?? (isFailedResult(result) ? "failed" : "completed"),
	});
	args.pi.sendMessage({
		customType: "pi-teammates/manual-delegate",
		content: transcript,
		display: true,
		details: {
			command: args.commandName,
			teammate: teammateName,
			sessionId: result.sessionId,
			status: result.status,
		},
	}, { triggerTurn: false });

	const headline = result.sessionId ? `${teammateName} (${result.sessionId})` : teammateName;
	args.ctx.ui.notify(
		isFailedResult(result) ? `Delegation failed: ${headline}` : `Delegation finished: ${headline}`,
		isFailedResult(result) ? "warning" : "info",
	);
}

async function runNewSessionTransfer(args: {
	ctx: Parameters<NonNullable<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>>[1];
	mode: "summary" | "handoff";
	rawArgs: string;
}): Promise<void> {
	const task = defaultNewSessionTask(args.mode, args.rawArgs.trim());
	const runtimeConfig = loadTeammatesConfig(args.ctx.cwd).config.teammates;
	const packet = await generateDelegationContext({
		mode: args.mode,
		task,
		branch: args.ctx.sessionManager.getBranch(),
		contextConfig: runtimeConfig.context,
		currentModel: args.ctx.model,
		modelRegistry: args.ctx.modelRegistry,
		signal: args.ctx.signal,
	});
	const prompt = buildDelegatedUserTask({ mode: args.mode, task, generatedContext: packet });
	const edited = await args.ctx.ui.editor(`Review ${args.mode} session prompt`, prompt);
	if (!edited?.trim()) return;

	await args.ctx.newSession({
		parentSession: args.ctx.sessionManager.getSessionFile(),
		withSession: async (replacementCtx) => {
			replacementCtx.ui.setEditorText(edited.trim());
			replacementCtx.ui.notify(`${args.mode} prompt ready in the new session.`, "info");
		},
	});
}

export default function teammatesExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		for (const job of collectInterruptedTeammateJobs(ctx.sessionManager.getEntries())) {
			pi.appendEntry(TEAMMATE_JOB_CUSTOM_TYPE, updateTeammateJobRecord(job, "interrupted"));
		}
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const selectedTools = event.systemPromptOptions.selectedTools ?? [];
		if (!selectedTools.includes("delegate")) return;

		const runtimeConfig = loadTeammatesConfig(ctx.cwd).config.teammates;
		const lineage = getLatestTeammateSessionState(ctx.sessionManager.getEntries())?.lineage ?? parseTeammatesLineage(process.env[TEAMMATES_LINEAGE_ENV]);
		const discovery = discoverTeammates(ctx.cwd, {
			loadProjectTeammates: runtimeConfig.loadProjectTeammates,
		});
		const availableTeammates = discovery.teammates.filter((teammate) =>
			canDelegateToTeammate({ targetName: teammate.name, lineage }),
		);
		if (availableTeammates.length === 0) return;

		return {
			systemPrompt: `${event.systemPrompt}\n\n${buildTeamPromptBlock(availableTeammates)}`,
		};
	});

	pi.registerCommand("team:delegate", {
		description: "Manually delegate a scoped task to a teammate while staying in the current session",
		getArgumentCompletions: async (prefix) => {
			const match = prefix.match(/(?:^|\s)--agent\s+(\S*)$/);
			if (!match) return null;
			const discovery = discoverTeammates(process.cwd(), {
				loadProjectTeammates: loadTeammatesConfig(process.cwd()).config.teammates.loadProjectTeammates,
			});
			return discovery.teammates
				.filter((teammate) => teammate.name.startsWith(match[1] ?? ""))
				.map((teammate) => ({ value: teammate.name, label: teammate.name }));
		},
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
						runtimeConfig,
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

	pi.registerCommand("team:manage", {
		description: "Open an interactive teammate manager for creating, editing, duplicating, and deleting teammate files",
		handler: async (_args, ctx) => {
			await runTeammateManager(ctx);
		},
	});

	pi.registerTool({
		name: "delegate",
		label: "Delegate",
		description: [
			"Delegate bounded execution work to configured teammates in isolated Pi sessions.",
			"Use `tasks` (parallel array) whenever you have two or more independent subtasks — parallel runs all tasks concurrently at zero additional wall-clock cost and is the correct default for independent work.",
			"Use `chain` for sequential pipelines where each step uses `{previous}` output from the prior step.",
			"Use single (`teammate`+`task`) only for a single isolated subtask.",
			"Use it when specialization, a fresh context window, or parallelism will materially improve the result; do not use for vague requests or work you can complete inline without quality loss.",
			"`context` controls how much caller state each child receives: `new` = task only, `summary` = fresh session plus generated task-focused context summary, `handoff` = fresh session plus execution-oriented handoff packet, `inherit` = exact caller session clone.",
			"If `context` is omitted the teammate's configured default is used (`new` unless overridden in the teammate file).",
			"`resumeSessionId` resumes an interrupted teammate run; do not combine with new task parameters.",
			"Streams progress while running and returns each teammate's final output with session IDs for status and resume flows.",
		].join(" "),
		promptSnippet: "Delegate bounded execution work to configured teammates in isolated internal Pi sessions.",
		promptGuidelines: [
			"Decompose work before calling delegate: identify all independent workstreams and sequential dependencies, then batch them into one call — N independent tasks into one `tasks` call (parallel), a sequential pipeline into one `chain` call.",
			"Never make multiple sequential delegate calls for independent subtasks — use `tasks` instead. Sequential delegation wastes wall-clock time and is the most common misuse of this tool.",
			"Use `delegate` only after you have decided the actual subtask; delegate execution, not judgment — decide the real work yourself first.",
			"In every delegated task, include the concrete goal, relevant files or symbols, key constraints or risks, and the expected output format.",
			"Prefer `context=new` for self-contained tasks; use `context=summary` when the teammate needs broader session background; use `context=handoff` for one specific next-step execution brief; use `context=inherit` only when exact transcript continuity is truly required.",
			"In chain tasks, use `{previous}` deliberately: only include it when the step genuinely depends on the prior output — do not copy it by default.",
			"Use `resumeSessionId` only to continue an existing interrupted child session; do not combine with new task parameters.",
			"After a teammate returns, synthesize or route the result yourself — do not assume the child owns the overall conversation.",
		],
		parameters: DelegateParamsSchema,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const runtimeConfig = loadTeammatesConfig(ctx.cwd).config.teammates;
			const lineage = getLatestTeammateSessionState(ctx.sessionManager.getEntries())?.lineage ?? parseTeammatesLineage(process.env[TEAMMATES_LINEAGE_ENV]);
			const currentBranch = ctx.sessionManager.getBranch();
			const currentEntries = ctx.sessionManager.getEntries();
			const currentSessionId = ctx.sessionManager.getSessionId();
			const currentSessionDir = ctx.sessionManager.getSessionDir();
			const currentSessionFile = ctx.sessionManager.getSessionFile();
			const appendJobRecord = (record: TeammateJobRecord) => {
				pi.appendEntry(TEAMMATE_JOB_CUSTOM_TYPE, record);
			};
			const discovery = discoverTeammates(ctx.cwd, {
				loadProjectTeammates: runtimeConfig.loadProjectTeammates,
			});
			const activeTools = pi.getActiveTools();
			const teammates = discovery.teammates.filter((teammate) =>
				canDelegateToTeammate({ targetName: teammate.name, lineage }),
			);
			const discoveryWarningNote = discovery.warnings.length > 0
				? `\n\n[Warning: ${discovery.warnings.length} teammate file(s) skipped due to parse errors: ${discovery.warnings.join("; ")}]`
				: "";

			const hasChain = (params.chain?.length ?? 0) > 0;
			const hasTasks = (params.tasks?.length ?? 0) > 0;
			const hasSingle = Boolean(params.teammate && params.task);
			const hasResume = typeof params.resumeSessionId === "string" && params.resumeSessionId.trim().length > 0;
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
				const sessionId = params.resumeSessionId!.trim();
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
					runtimeConfig,
					job,
					signal,
					onUpdate,
					makeDetails: makeDetails("single"),
					modelRegistry: ctx.modelRegistry,
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

			const blockedTeammates = collectRequestedTeammates(params).filter(
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

			if (params.chain && params.chain.length > 0) {
				const results: SingleResult[] = [];
				let previousOutput = "";

				for (let i = 0; i < params.chain.length; i++) {
					const step = params.chain[i];
					const taskWithContext = step.task.replace(/\{previous\}/g, previousOutput);
					const chainUpdate: OnUpdateCallback | undefined = onUpdate
						? (partial) => {
								const currentResult = partial.details?.results[0];
								if (!currentResult) return;
								onUpdate({
									content: partial.content,
									details: makeDetails("chain")([...results, currentResult]),
								});
							}
						: undefined;

					const result = await runSingleTeammate({
						defaultCwd: ctx.cwd,
						runtimeConfig,
						activeTools,
						teammates,
						lineage,
						parentBranch: currentBranch,
						parentSessionId: currentSessionId,
						parentSessionDir: currentSessionDir,
						currentSessionFile,
						currentModel: ctx.model,
						modelRegistry: ctx.modelRegistry,
						appendJobRecord,
						contextOverride: params.context,
						teammateName: step.teammate,
						task: taskWithContext,
						cwd: step.cwd,
						step: i + 1,
						signal,
						onUpdate: chainUpdate,
						makeDetails: makeDetails("chain"),
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
							details: makeDetails("chain")(results),
						};
					}
					previousOutput = getFinalOutput(result.messages);
				}

				return {
					content: [{
						type: "text",
						text: `${results.map((result) => formatChainResultLabel(result)).join("\n")}\n\n${getFinalOutput(results[results.length - 1].messages) || "(no output)"}`,
					}],
					details: makeDetails("chain")(results),
				};
			}

			if (params.tasks && params.tasks.length > 0) {
				if (params.tasks.length > runtimeConfig.maxParallelTasks) {
					return {
						content: [
							{
								type: "text",
								text: `Too many parallel tasks (${params.tasks.length}). Max is ${runtimeConfig.maxParallelTasks}.`,
							},
						],
						details: makeDetails("parallel")([]),
					};
				}

				const allResults: SingleResult[] = new Array(params.tasks.length);
				for (let i = 0; i < params.tasks.length; i++) {
					allResults[i] = {
						teammate: params.tasks[i].teammate,
						teammateSource: "unknown",
						task: params.tasks[i].task,
						exitCode: -1,
						messages: [],
						stderr: "",
						usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
					};
				}

				const emitParallelUpdate = () => {
					if (!onUpdate) return;
					const running = allResults.filter((result) => result.exitCode === -1).length;
					const done = allResults.filter((result) => result.exitCode !== -1).length;
					onUpdate({
						content: [{ type: "text", text: `Parallel: ${done}/${allResults.length} done, ${running} running...` }],
						details: makeDetails("parallel")([...allResults]),
					});
				};

				const results = await mapWithConcurrencyLimit(
					params.tasks,
					runtimeConfig.maxConcurrency,
					async (taskItem, index) => {
						const result = await runSingleTeammate({
							defaultCwd: ctx.cwd,
							runtimeConfig,
							activeTools,
							teammates,
							lineage,
							parentBranch: currentBranch,
							parentSessionId: currentSessionId,
							parentSessionDir: currentSessionDir,
							currentSessionFile,
							currentModel: ctx.model,
							modelRegistry: ctx.modelRegistry,
							appendJobRecord,
							contextOverride: params.context,
							teammateName: taskItem.teammate,
							task: taskItem.task,
							cwd: taskItem.cwd,
							step: undefined,
							signal,
							onUpdate: (partial) => {
								if (!partial.details?.results[0]) return;
								allResults[index] = partial.details.results[0];
								emitParallelUpdate();
							},
							makeDetails: makeDetails("parallel"),
						});
						allResults[index] = result;
						emitParallelUpdate();
						return result;
					},
				);

				const successCount = results.filter((result) => !isFailedResult(result)).length;
				const summaries = results.map((result) => {
					const output = truncateParallelOutput(getResultOutput(result), runtimeConfig.perTaskOutputCap);
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
					details: makeDetails("parallel")(results),
				};
			}

			if (params.teammate && params.task) {
				const result = await runSingleTeammate({
					defaultCwd: ctx.cwd,
					runtimeConfig,
					activeTools,
					teammates,
					lineage,
					parentBranch: currentBranch,
					parentSessionId: currentSessionId,
					parentSessionDir: currentSessionDir,
					currentSessionFile,
					currentModel: ctx.model,
					modelRegistry: ctx.modelRegistry,
					appendJobRecord,
					contextOverride: params.context,
					teammateName: params.teammate,
					task: params.task,
					cwd: params.cwd,
					step: undefined,
					signal,
					onUpdate,
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
		},

		renderCall(args, theme) {
			const RES = "⎿  ";
			const contextSuffix = args.context ? theme.fg("dim", ` [${args.context}]`) : "";

			if (args.resumeSessionId) {
				return new Text(
					theme.fg("toolTitle", theme.bold("Delegate")) +
					theme.fg("muted", "(") + theme.fg("accent", `resume ${args.resumeSessionId}`) + theme.fg("muted", ")"),
					0, 0,
				);
			}
			if (args.chain && args.chain.length > 0) {
				let text =
					theme.fg("toolTitle", theme.bold("Delegate")) +
					theme.fg("muted", "(") + theme.fg("accent", `chain · ${args.chain.length} steps`) + theme.fg("muted", ")") +
					contextSuffix;
				for (let i = 0; i < Math.min(args.chain.length, 3); i++) {
					const step = args.chain[i];
					const cleanTask = step.task.replace(/\{previous\}/g, "").trim();
					const preview = cleanTask.length > 40 ? `${cleanTask.slice(0, 40)}…` : cleanTask;
					text += "\n" + theme.fg("muted", RES) + theme.fg("muted", `${i + 1}.`) + " " +
						theme.fg("accent", step.teammate) + theme.fg("dim", ` ${preview}`);
				}
				if (args.chain.length > 3) text += "\n" + theme.fg("muted", `${RES}… +${args.chain.length - 3} more steps`);
				return new Text(text, 0, 0);
			}
			if (args.tasks && args.tasks.length > 0) {
				let text =
					theme.fg("toolTitle", theme.bold("Delegate")) +
					theme.fg("muted", "(") + theme.fg("accent", `${args.tasks.length} tasks`) + theme.fg("muted", ")") +
					contextSuffix;
				for (const taskItem of args.tasks.slice(0, 3)) {
					const preview = taskItem.task.length > 40 ? `${taskItem.task.slice(0, 40)}…` : taskItem.task;
					text += "\n" + theme.fg("muted", RES) + theme.fg("accent", taskItem.teammate) + theme.fg("dim", ` ${preview}`);
				}
				if (args.tasks.length > 3) text += "\n" + theme.fg("muted", `${RES}… +${args.tasks.length - 3} more`);
				return new Text(text, 0, 0);
			}
			const teammateName = args.teammate || "…";
			const preview = args.task ? (args.task.length > 60 ? `${args.task.slice(0, 60)}…` : args.task) : "…";
			let text =
				theme.fg("toolTitle", theme.bold("Delegate")) +
				theme.fg("muted", "(") + theme.fg("accent", teammateName) + theme.fg("muted", ")") +
				contextSuffix;
			text += "\n" + theme.fg("muted", RES) + theme.fg("dim", preview);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as DelegateDetails | undefined;
			if (!details || details.results.length === 0) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
			}

			const mdTheme = getMarkdownTheme();
			const RES = "⎿  ";
			const IND = "     ";

			const aggregateUsage = (results: SingleResult[]) => {
				const total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 };
				for (const item of results) {
					total.input += item.usage.input;
					total.output += item.usage.output;
					total.cacheRead += item.usage.cacheRead;
					total.cacheWrite += item.usage.cacheWrite;
					total.cost += item.usage.cost;
					total.turns += item.usage.turns;
				}
				return total;
			};

			if (details.mode === "single" && details.results.length === 1) {
				const single = details.results[0];
				const isError = isFailedResult(single);
				const isRunning = single.status === "running";
				const icon = isError ? theme.fg("error", "✗") : theme.fg("success", "✓");
				const displayItems = getDisplayItems(single.messages);
				const finalOutput = getFinalOutput(single.messages);

				if (expanded) {
					const container = new Container();
					let header = `${icon} ${theme.fg("toolTitle", theme.bold(single.teammate))}${theme.fg("muted", ` (${single.teammateSource})`)}`;
					if (isError && single.stopReason) header += ` ${theme.fg("error", `[${single.stopReason}]`)}`;
					container.addChild(new Text(header, 0, 0));
					if (isError && single.errorMessage) {
						container.addChild(new Text(theme.fg("error", `Error: ${single.errorMessage}`), 0, 0));
					}
					container.addChild(new Spacer(1));
					container.addChild(new Text(theme.fg("muted", "─── Task ───"), 0, 0));
					container.addChild(new Text(theme.fg("dim", single.task), 0, 0));
					container.addChild(new Spacer(1));
					container.addChild(new Text(theme.fg("muted", "─── Output ───"), 0, 0));
					if (displayItems.length === 0 && !finalOutput) {
						container.addChild(new Text(theme.fg("muted", "(no output)"), 0, 0));
					} else {
						for (const item of displayItems) {
							if (item.type === "toolCall") {
								container.addChild(
									new Text(formatToolCall(item.name, item.args, theme.fg.bind(theme)), 0, 0),
								);
							}
						}
						if (finalOutput) {
							container.addChild(new Spacer(1));
							container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
						}
					}
					const usageString = formatUsageStats(single.usage, single.model);
					if (usageString) {
						container.addChild(new Spacer(1));
						container.addChild(new Text(theme.fg("dim", usageString), 0, 0));
					}
					return container;
				}

				// Collapsed running state
				if (isRunning) {
					const toolCalls = displayItems.filter((item) => item.type === "toolCall");
					const recentCalls = toolCalls.slice(-3);
					const hiddenCount = toolCalls.length > 3 ? toolCalls.length - 3 : 0;
					let text = theme.fg("toolTitle", theme.bold(single.teammate));
					if (single.model) text += theme.fg("dim", ` ${single.model}`);
					if (hiddenCount > 0) text += `\n${theme.fg("muted", `${RES}… +${hiddenCount} tool uses`)}`;
					for (const call of recentCalls) {
						text += `\n${theme.fg("muted", RES)}${formatToolCall(call.name, call.args, theme.fg.bind(theme))}`;
					}
					text += `\n${theme.fg("muted", `${IND}Running…`)}`;
					return new Text(text, 0, 0);
				}

				// Collapsed done state
				const usageString = formatUsageStats(single.usage, single.model);
				const doneLine = usageString ? `Done (${usageString})` : "Done";
				let text = `${icon} ${theme.fg("toolTitle", theme.bold(single.teammate))}`;
				if (isError && single.stopReason) text += theme.fg("error", ` [${single.stopReason}]`);
				if (isError && single.errorMessage) {
					text += `\n${theme.fg("muted", RES)}${theme.fg("error", single.errorMessage)}`;
				} else {
					text += `\n${theme.fg("muted", RES)}${theme.fg("dim", doneLine)}`;
					if (finalOutput) {
						const preview = finalOutput.split("\n").slice(0, 3).join("\n");
						text += `\n${theme.fg("toolOutput", preview)}`;
					} else if (displayItems.length === 0) {
						text += `\n${theme.fg("muted", `${IND}(no output)`)}`;
					}
					const toolCalls = displayItems.filter((item) => item.type === "toolCall");
					if (toolCalls.length > details.collapsedItemCount) {
						text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
					}
				}
				return new Text(text, 0, 0);
			}

			if (details.mode === "chain") {
				const completedCount = details.results.filter((item) => item.exitCode !== -1).length;
				const successCount = details.results.filter((item) => item.exitCode === 0).length;
				const icon = completedCount < details.results.length
					? theme.fg("warning", "⏳")
					: successCount === details.results.length ? theme.fg("success", "✓") : theme.fg("error", "✗");

				if (expanded) {
					const container = new Container();
					container.addChild(
						new Text(
							icon + " " +
							theme.fg("toolTitle", theme.bold("chain ")) +
							theme.fg("accent", `${successCount}/${details.results.length} steps`),
							0, 0,
						),
					);
					for (const item of details.results) {
						const itemIcon = item.exitCode === 0 ? theme.fg("success", "✓") : theme.fg("error", "✗");
						const displayItems = getDisplayItems(item.messages);
						const finalOutput = getFinalOutput(item.messages);
						container.addChild(new Spacer(1));
						container.addChild(
							new Text(
								theme.fg("muted", `─── Step ${item.step ?? ""}: `) + theme.fg("accent", item.teammate) + " " + itemIcon,
								0, 0,
							),
						);
						container.addChild(new Text(theme.fg("muted", "Task: ") + theme.fg("dim", item.task), 0, 0));
						for (const displayItem of displayItems) {
							if (displayItem.type === "toolCall") {
								container.addChild(new Text(formatToolCall(displayItem.name, displayItem.args, theme.fg.bind(theme)), 0, 0));
							}
						}
						if (finalOutput) {
							container.addChild(new Spacer(1));
							container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
						}
						const stepUsage = formatUsageStats(item.usage, item.model);
						if (stepUsage) container.addChild(new Text(theme.fg("dim", stepUsage), 0, 0));
					}
					const usageString = formatUsageStats(aggregateUsage(details.results));
					if (usageString) {
						container.addChild(new Spacer(1));
						container.addChild(new Text(theme.fg("dim", `Total: ${usageString}`), 0, 0));
					}
					return container;
				}

				// Collapsed chain — tree view
				let text = icon + " " + theme.fg("toolTitle", theme.bold("chain ")) + theme.fg("accent", `${successCount}/${details.results.length} steps`);
				for (let i = 0; i < details.results.length; i++) {
					const item = details.results[i];
					const isLast = i === details.results.length - 1;
					const branch = theme.fg("muted", isLast ? "   └ " : "   ├ ");
					const cont = isLast ? "     " : theme.fg("muted", "   │ ");
					const itemRunning = item.status === "running";
					const stepLabel = theme.fg("muted", `Step ${item.step ?? i + 1}: `) + theme.fg("accent", item.teammate);
					const stepUsage = !itemRunning ? formatUsageStats(item.usage, item.model) : "";
					const statSuffix = stepUsage ? theme.fg("dim", `  · ${stepUsage}`) : "";
					const statusIcon = itemRunning ? theme.fg("warning", " …") : item.exitCode === 0 ? theme.fg("success", " ✓") : theme.fg("error", " ✗");
					text += "\n" + branch + stepLabel + statSuffix + statusIcon;
					if (itemRunning) {
						const toolCalls = getDisplayItems(item.messages).filter((c) => c.type === "toolCall");
						const last = toolCalls[toolCalls.length - 1];
						if (last) text += "\n" + cont + theme.fg("muted", RES) + formatToolCall(last.name, last.args, theme.fg.bind(theme));
						text += "\n" + cont + theme.fg("muted", `${IND}Running…`);
					} else {
						const donePart = item.exitCode !== 0 ? `Error${item.stopReason ? ` [${item.stopReason}]` : ""}` : "Done";
						text += "\n" + cont + theme.fg("muted", RES) + theme.fg("dim", donePart);
					}
				}
				const usageString = formatUsageStats(aggregateUsage(details.results));
				if (usageString) text += `\n\n${theme.fg("dim", `Total: ${usageString}`)}`;
				text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
				return new Text(text, 0, 0);
			}

			if (details.mode === "parallel") {
				const running = details.results.filter((item) => item.exitCode === -1).length;
				const successCount = details.results.filter((item) => item.exitCode !== -1 && !isFailedResult(item)).length;
				const failCount = details.results.filter((item) => item.exitCode !== -1 && isFailedResult(item)).length;
				const isRunning = running > 0;
				const icon = isRunning
					? theme.fg("warning", "⏳")
					: failCount > 0 ? theme.fg("warning", "◐") : theme.fg("success", "✓");
				const status = isRunning
					? `${successCount + failCount}/${details.results.length} done · ${running} running`
					: `${successCount}/${details.results.length} tasks`;

				if (expanded && !isRunning) {
					const container = new Container();
					container.addChild(new Text(`${icon} ${theme.fg("toolTitle", theme.bold("parallel "))}${theme.fg("accent", status)}`, 0, 0));
					for (const item of details.results) {
						const itemIcon = isFailedResult(item) ? theme.fg("error", "✗") : theme.fg("success", "✓");
						const displayItems = getDisplayItems(item.messages);
						const finalOutput = getFinalOutput(item.messages);
						container.addChild(new Spacer(1));
						container.addChild(new Text(theme.fg("muted", "─── ") + theme.fg("accent", item.teammate) + " " + itemIcon, 0, 0));
						container.addChild(new Text(theme.fg("muted", "Task: ") + theme.fg("dim", item.task), 0, 0));
						for (const displayItem of displayItems) {
							if (displayItem.type === "toolCall") {
								container.addChild(new Text(formatToolCall(displayItem.name, displayItem.args, theme.fg.bind(theme)), 0, 0));
							}
						}
						if (finalOutput) {
							container.addChild(new Spacer(1));
							container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
						}
						const taskUsage = formatUsageStats(item.usage, item.model);
						if (taskUsage) container.addChild(new Text(theme.fg("dim", taskUsage), 0, 0));
					}
					const usageString = formatUsageStats(aggregateUsage(details.results));
					if (usageString) {
						container.addChild(new Spacer(1));
						container.addChild(new Text(theme.fg("dim", `Total: ${usageString}`), 0, 0));
					}
					return container;
				}

				// Collapsed parallel — CC-style tree view
				const finishedCount = successCount + failCount;
				const headerLabel = isRunning
					? theme.fg("toolTitle", theme.bold("parallel ")) + theme.fg("accent", status)
					: theme.fg("accent", String(finishedCount)) + " " + theme.fg("toolTitle", theme.bold(finishedCount === 1 ? "teammate finished" : "teammates finished")) +
						(failCount > 0 ? theme.fg("warning", ` (${failCount} failed)`) : "");
				let text = `${icon} ${headerLabel}`;
				for (let i = 0; i < details.results.length; i++) {
					const item = details.results[i];
					const isLast = i === details.results.length - 1;
					const branch = theme.fg("muted", isLast ? "   └ " : "   ├ ");
					const cont = isLast ? "     " : theme.fg("muted", "   │ ");
					const itemRunning = item.exitCode === -1;
					const itemFailed = !itemRunning && isFailedResult(item);
					const taskUsage = !itemRunning ? formatUsageStats(item.usage, item.model) : "";
					const usageSuffix = taskUsage ? theme.fg("dim", `  · ${taskUsage}`) : "";
					const statusIcon = itemRunning ? "" : itemFailed ? theme.fg("error", " ✗") : "";
					text += "\n" + branch + theme.fg("accent", item.teammate) + usageSuffix + statusIcon;
					if (itemRunning) {
						const toolCalls = getDisplayItems(item.messages).filter((c) => c.type === "toolCall");
						const last = toolCalls[toolCalls.length - 1];
						if (last) text += "\n" + cont + theme.fg("muted", RES) + formatToolCall(last.name, last.args, theme.fg.bind(theme));
						text += "\n" + cont + theme.fg("muted", `${IND}Running…`);
					} else {
						const donePart = itemFailed ? `Error${item.stopReason && item.stopReason !== "end" ? ` [${item.stopReason}]` : ""}` : "Done";
						text += "\n" + cont + theme.fg("muted", RES) + theme.fg("dim", donePart);
					}
				}
				if (!isRunning) {
					const usageString = formatUsageStats(aggregateUsage(details.results));
					if (usageString) text += `\n\n${theme.fg("dim", `Total: ${usageString}`)}`;
				}
				if (!expanded) text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
				return new Text(text, 0, 0);
			}

			const text = result.content[0];
			return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
		},
	});
}
