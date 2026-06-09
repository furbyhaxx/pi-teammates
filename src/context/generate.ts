import { complete, type Model, type ThinkingLevel } from "@earendil-works/pi-ai";
import {
	convertToLlm,
	serializeConversation,
	type ModelRegistry,
	type SessionEntry,
} from "@earendil-works/pi-coding-agent";

import { uniqueBy } from "../shared/arrays.ts";
import { getContextTransferMessages } from "./messages.ts";
import { resolveConfiguredContextModelRefs } from "./model-refs.ts";
import type { TeammateContextMode } from "./modes.ts";
import {
	HANDOFF_SYSTEM_PROMPT,
	SUMMARY_SYSTEM_PROMPT,
	type TeammatesContextConfig,
} from "./prompts.ts";

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
	let conversationText = serializeConversation(
		convertToLlm(getContextTransferMessages(args.branch)),
	);
	if (!conversationText.trim()) {
		throw new Error(`Cannot generate ${args.mode} context: no conversation history available.`);
	}

	if (args.contextConfig.contextMaxChars && conversationText.length > args.contextConfig.contextMaxChars) {
		const omitted = conversationText.length - args.contextConfig.contextMaxChars;
		conversationText = `[Conversation truncated: ${omitted} chars omitted from the beginning]\n\n${conversationText.slice(-args.contextConfig.contextMaxChars)}`;
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

	const systemPrompt =
		args.mode === "handoff"
			? (args.contextConfig.handoffSystemPrompt ?? HANDOFF_SYSTEM_PROMPT)
			: (args.contextConfig.summarySystemPrompt ?? SUMMARY_SYSTEM_PROMPT);

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
