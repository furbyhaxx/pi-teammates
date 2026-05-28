import { complete, type Model } from "@earendil-works/pi-ai";
import type { ModelRegistry, SessionEntry } from "@earendil-works/pi-coding-agent";
import { convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";

export interface ParsedTeamCommandArgs {
	agent?: string;
	improve: boolean;
	task: string;
}

export const IMPROVE_TASK_SYSTEM_PROMPT = `# Role
You rewrite rough delegation requests into high-signal execution briefs for teammate execution.

# Task
Given the selected delegation context mode, the current conversation, and a rough task, rewrite it into a tighter delegated brief that a child teammate can execute with minimal ambiguity.

# Constraints
- Preserve the user's real intent and scope.
- Do not invent files, requirements, constraints, risks, or outputs that are not supported by the provided context.
- Prefer concrete files, symbols, commands, constraints, and deliverables over vague wording.
- Include exact files, commands, constraints, risks, or expected outputs only when the conversation supports them.
- If the rough task is already strong, keep the rewrite minimal.
- Adapt to context mode:
  - new: include the minimum local context the child must see in the task itself.
  - summary: assume broader background arrives separately; focus the task on the next bounded objective.
  - handoff: phrase the task as a direct next-step execution brief with a clear deliverable.
  - inherit: avoid restating transcript background unless it materially sharpens the assignment.
- Do not add commentary about the rewrite process.
- Do not use markdown fences.

# Preferred Shape
When the context supports it, use a compact brief with short sections such as:
Goal:
Relevant files:
Constraints:
Return:

# Output Format
Return only the improved delegated task text.`;

export function buildImproveDelegationPrompt(args: {
	contextLabel: string;
	conversationText: string;
	rawTask: string;
}): string {
	return [
		"<delegation_context_mode>",
		args.contextLabel,
		"</delegation_context_mode>",
		"<current_conversation>",
		args.conversationText,
		"</current_conversation>",
		"<rough_task>",
		args.rawTask,
		"</rough_task>",
	].join("\n");
}

export function parseTeamCommandArgs(input: string): ParsedTeamCommandArgs {
	const tokens = tokenizeArgs(input);
	let agent: string | undefined;
	let improve = false;
	const taskTokens: string[] = [];

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (token === "--improve") {
			improve = true;
			continue;
		}
		if (token === "--agent") {
			agent = tokens[i + 1]?.trim() || undefined;
			i++;
			continue;
		}
		taskTokens.push(token);
	}

	return {
		agent,
		improve,
		task: taskTokens.join(" ").trim(),
	};
}

export async function improveDelegationTask(args: {
	rawTask: string;
	branch: SessionEntry[];
	model: Model<any>;
	modelRegistry: ModelRegistry;
	contextLabel: string;
	signal?: AbortSignal;
	thinkingLevel?: "minimal" | "low" | "medium" | "high" | "xhigh";
}): Promise<string> {
	const auth = await args.modelRegistry.getApiKeyAndHeaders(args.model);
	if (!auth.ok || !auth.apiKey) {
		throw new Error(auth.ok ? `No API key for ${args.model.provider}/${args.model.id}` : auth.error);
	}

	const conversationText = serializeConversation(
		convertToLlm(
			args.branch
				.filter((entry): entry is Extract<SessionEntry, { type: "message" }> => entry.type === "message")
				.map((entry) => entry.message),
		),
	);

	const prompt = buildImproveDelegationPrompt({
		contextLabel: args.contextLabel,
		conversationText,
		rawTask: args.rawTask,
	});

	const response = await complete(
		args.model,
		{
			systemPrompt: IMPROVE_TASK_SYSTEM_PROMPT,
			messages: [
				{
					role: "user",
					content: [{ type: "text", text: prompt }],
					timestamp: Date.now(),
				},
			],
		},
		{
			apiKey: auth.apiKey,
			headers: auth.headers,
			signal: args.signal,
			...(args.thinkingLevel ? { reasoning: args.thinkingLevel } : {}),
		},
	);

	const improved = response.content
		.filter((item): item is { type: "text"; text: string } => item.type === "text")
		.map((item) => item.text)
		.join("\n")
		.trim();

	if (!improved) {
		throw new Error("Task improvement returned an empty response.");
	}

	return improved;
}

export function buildManualDelegationTranscript(args: {
	commandName: string;
	teammateName: string;
	contextMode: string;
	task: string;
	sessionId?: string;
	model?: string;
	resultText: string;
	status: string;
}): string {
	return [
		`<manual_teammate_invocation command="${escapeXml(args.commandName)}" teammate="${escapeXml(args.teammateName)}" context="${escapeXml(args.contextMode)}" status="${escapeXml(args.status)}">`,
		`<task>${escapeXml(args.task)}</task>`,
		args.sessionId ? `<session>${escapeXml(args.sessionId)}</session>` : "",
		args.model ? `<model>${escapeXml(args.model)}</model>` : "",
		"<result>",
		escapeXml(args.resultText),
		"</result>",
		"</manual_teammate_invocation>",
	].filter((line) => line !== "").join("\n");
}

export function defaultNewSessionTask(mode: "summary" | "handoff", providedTask: string): string {
	if (providedTask.trim().length > 0) return providedTask.trim();
	return mode === "handoff"
		? "Continue the next task from this handoff in the new session."
		: "Continue the work from this summary in the new session.";
}

export function buildTeammateTemplate(args: { name: string; description: string }): string {
	return [
		"---",
		`name: ${args.name}`,
		`description: ${args.description}`,
		"model: ",
		"context: new",
		"prompt: append",
		"skills: []",
		"tools:",
		"  read: true",
		"  grep: true",
		"  find: true",
		"  ls: true",
		"  write: false",
		"  edit: false",
		"  bash: false",
		"  delegate: false",
		"---",
		"Describe how this teammate should work.",
	].join("\n");
}

function tokenizeArgs(input: string): string[] {
	const matches = input.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\S+/g) ?? [];
	return matches.map((token) => {
		if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
			return token.slice(1, -1);
		}
		return token;
	});
}

function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}
