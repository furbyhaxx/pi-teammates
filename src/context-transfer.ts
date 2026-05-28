import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { complete, type Model, type ThinkingLevel } from "@earendil-works/pi-ai";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";

export const TEAMMATE_CONTEXT_MODES = ["new", "inherit", "summary", "handoff"] as const;
export type TeammateContextMode = (typeof TEAMMATE_CONTEXT_MODES)[number];

export interface TeammatesContextConfig {
	models: string[];
	summaryModels: string[];
	handoffModels: string[];
}

export interface ParsedContextModelRef {
	provider: string;
	id: string;
	thinking?: ThinkingLevel;
}

interface ResolveConfiguredContextModelRefsArgs {
	mode: TeammateContextMode;
	config: TeammatesContextConfig;
	defaultProvider?: string;
}

interface GenerateDelegationContextArgs {
	mode: Extract<TeammateContextMode, "summary" | "handoff">;
	task: string;
	branch: SessionEntry[];
	contextConfig: TeammatesContextConfig;
	currentModel: Model<any> | undefined;
	modelRegistry: ModelRegistry;
	signal?: AbortSignal;
}

interface ResolvedGenerationCandidate {
	model: Model<any>;
	thinking?: ThinkingLevel;
	label: string;
}

const THINKING_LEVELS = new Set<ThinkingLevel>([
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
]);

const SUMMARY_SYSTEM_PROMPT = `You are a context transfer assistant for delegated coding work.

Given a conversation history and a delegated task, generate a concise, self-contained context packet for another coding agent.

Requirements:
- Focus only on information relevant to the delegated task.
- Preserve decisions, constraints, findings, and file paths that materially affect the delegated task.
- Keep it compact, precise, and execution-oriented.
- Do not answer the delegated task yourself.
- Do not include preamble.

Output format:
## Task Context
- goal
- current state
- key findings

## Relevant Files
- path: why it matters

## Constraints
- required behaviors, decisions, limitations, or risks

## Next Focus
- what the delegated teammate should pay attention to first`;

const HANDOFF_SYSTEM_PROMPT = `You are a task handoff assistant.

Given a conversation history and a specific delegated task, generate a focused handoff packet for another coding agent.

Requirements:
- Frame the output as a clean handoff for executing one specific next task.
- Include only context relevant to that task handoff.
- Preserve important decisions, constraints, files, and unresolved risks.
- Make the handoff self-contained and ready for action.
- Do not include preamble.

Output format:
## Context
Brief summary of the current work and why this task matters.

## Files Involved
- exact/path: why it matters

## Handoff Task
Clear statement of the specific next task.

## Constraints And Risks
- decisions already made
- assumptions to keep
- edge cases, blockers, or pitfalls`;

export function parseTeammateContextMode(value: unknown): TeammateContextMode {
	return typeof value === "string" && TEAMMATE_CONTEXT_MODES.includes(value as TeammateContextMode)
		? (value as TeammateContextMode)
		: "new";
}

export function selectContextMode(
	overrideMode: TeammateContextMode | undefined,
	defaultMode: TeammateContextMode,
): TeammateContextMode {
	return overrideMode ?? defaultMode;
}

export function parseContextModelRef(
	value: string | undefined,
	defaultProvider?: string,
): ParsedContextModelRef | undefined {
	const trimmed = value?.trim();
	if (!trimmed) return undefined;

	const slash = trimmed.indexOf("/");
	const provider = slash > 0 ? trimmed.slice(0, slash) : defaultProvider;
	let id = slash > 0 ? trimmed.slice(slash + 1) : trimmed;
	if (!provider || !id) return undefined;

	let thinking: ThinkingLevel | undefined;
	const colon = id.lastIndexOf(":");
	if (colon > 0) {
		const suffix = id.slice(colon + 1);
		if (!THINKING_LEVELS.has(suffix as ThinkingLevel)) return undefined;
		thinking = suffix as ThinkingLevel;
		id = id.slice(0, colon);
	}
	if (!id) return undefined;
	return { provider, id, thinking };
}

export function resolveConfiguredContextModelRefs(args: ResolveConfiguredContextModelRefsArgs): ParsedContextModelRef[] {
	const configuredValues =
		args.mode === "summary" && args.config.summaryModels.length > 0
			? args.config.summaryModels
			: args.mode === "handoff" && args.config.handoffModels.length > 0
				? args.config.handoffModels
				: args.config.models;

	const refs = configuredValues
		.map((value) => parseContextModelRef(value, args.defaultProvider))
		.filter((value): value is ParsedContextModelRef => value !== undefined);
	return uniqueBy(refs, (ref) => `${ref.provider}/${ref.id}:${ref.thinking ?? ""}`);
}

export function buildDelegatedUserTask(args: {
	mode: TeammateContextMode;
	task: string;
	generatedContext?: string;
}): string {
	if (args.mode === "new" || args.mode === "inherit" || !args.generatedContext) {
		return `Task: ${args.task}`;
	}

	return [
		`<delegation_context mode="${args.mode}">`,
		args.generatedContext.trim(),
		"</delegation_context>",
		"",
		"<delegated_task>",
		args.task,
		"</delegated_task>",
	].join("\n");
}

export async function generateDelegationContext(args: GenerateDelegationContextArgs): Promise<string> {
	const conversationText = serializeConversation(
		convertToLlm(getContextTransferMessages(args.branch)),
	);
	if (!conversationText.trim()) {
		throw new Error(`Cannot generate ${args.mode} context: no conversation history available.`);
	}

	const candidates = resolveGenerationCandidates({
		mode: args.mode,
		contextConfig: args.contextConfig,
		currentModel: args.currentModel,
		modelRegistry: args.modelRegistry,
	});
	if (candidates.length === 0) {
		throw new Error(`Cannot generate ${args.mode} context: no usable models configured and no current session model available.`);
	}

	const systemPrompt = args.mode === "handoff" ? HANDOFF_SYSTEM_PROMPT : SUMMARY_SYSTEM_PROMPT;
	const promptText = [
		`## Conversation History\n\n${conversationText}`,
		`## Delegated Task\n\n${args.task}`,
	].join("\n\n");

	const failures: string[] = [];
	for (const candidate of candidates) {
		const auth = await args.modelRegistry.getApiKeyAndHeaders(candidate.model);
		if (!auth.ok || !auth.apiKey) {
			failures.push(`${candidate.label}: ${auth.ok ? "No API key configured" : auth.error}`);
			continue;
		}

		try {
			const response = await complete(
				candidate.model,
				{
					systemPrompt,
					messages: [
						{
							role: "user",
							content: [{ type: "text", text: promptText }],
							timestamp: Date.now(),
						},
					],
				},
				{
					apiKey: auth.apiKey,
					headers: auth.headers,
					signal: args.signal,
					...(candidate.thinking ? { reasoning: candidate.thinking } : {}),
				},
			);

			if (response.stopReason === "aborted") {
				throw new Error("generation aborted");
			}

			const text = response.content
				.filter((item): item is { type: "text"; text: string } => item.type === "text")
				.map((item) => item.text)
				.join("\n")
				.trim();
			if (text) return text;
			failures.push(`${candidate.label}: empty response`);
		} catch (error) {
			failures.push(`${candidate.label}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	throw new Error(`Failed to generate ${args.mode} context. ${failures.join("; ")}`);
}

function resolveGenerationCandidates(args: {
	mode: Extract<TeammateContextMode, "summary" | "handoff">;
	contextConfig: TeammatesContextConfig;
	currentModel: Model<any> | undefined;
	modelRegistry: ModelRegistry;
}): ResolvedGenerationCandidate[] {
	const configuredRefs = resolveConfiguredContextModelRefs({
		mode: args.mode,
		config: args.contextConfig,
		defaultProvider: args.currentModel?.provider,
	});
	const configuredCandidates: ResolvedGenerationCandidate[] = [];
	for (const ref of configuredRefs) {
		const model = args.modelRegistry.find(ref.provider, ref.id);
		if (!model) continue;
		configuredCandidates.push({
			model,
			thinking: ref.thinking,
			label: `${ref.provider}/${ref.id}${ref.thinking ? `:${ref.thinking}` : ""}`,
		});
	}

	const fallback: ResolvedGenerationCandidate[] = args.currentModel
		? [
				{
					model: args.currentModel,
					thinking: undefined,
					label: `${args.currentModel.provider}/${args.currentModel.id}`,
				},
			]
		: [];

	return uniqueBy([...configuredCandidates, ...fallback], (candidate) => candidate.label);
}

function getContextTransferMessages(branch: SessionEntry[]): AgentMessage[] {
	let compactionIndex = -1;
	for (let i = branch.length - 1; i >= 0; i--) {
		if (branch[i].type === "compaction") {
			compactionIndex = i;
			break;
		}
	}
	if (compactionIndex < 0) {
		return branch.map(entryToMessage).filter((message) => message !== undefined);
	}

	const compaction = branch[compactionIndex];
	const firstKeptIndex =
		compaction.type === "compaction" ? branch.findIndex((entry) => entry.id === compaction.firstKeptEntryId) : -1;
	const compactedBranch = [
		compaction,
		...(firstKeptIndex >= 0 ? branch.slice(firstKeptIndex, compactionIndex) : []),
		...branch.slice(compactionIndex + 1),
	];
	return compactedBranch.map(entryToMessage).filter((message) => message !== undefined);
}

function entryToMessage(entry: SessionEntry): AgentMessage | undefined {
	if (entry.type === "message") {
		return entry.message;
	}
	if (entry.type === "compaction") {
		return {
			role: "compactionSummary",
			summary: entry.summary,
			tokensBefore: entry.tokensBefore,
			timestamp: new Date(entry.timestamp).getTime(),
		};
	}
	return undefined;
}

function uniqueBy<T>(values: T[], keyFn: (value: T) => string): T[] {
	const seen = new Set<string>();
	const out: T[] = [];
	for (const value of values) {
		const key = keyFn(value);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(value);
	}
	return out;
}
