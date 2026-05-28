import { complete, type Model } from "@earendil-works/pi-ai";
import type { ModelRegistry, SessionEntry } from "@earendil-works/pi-coding-agent";
import { convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";

export interface ParsedTeamCommandArgs {
	agent?: string;
	improve: boolean;
	task: string;
}

const IMPROVE_TASK_SYSTEM_PROMPT = `You improve delegated coding tasks for teammate execution.

Given the current session context and a rough task, rewrite it into a tighter, clearer, more actionable delegated task.

Rules:
- Preserve the user's actual intent.
- Keep the task scoped and concrete.
- Mention exact files, constraints, risks, or outputs when the conversation makes them relevant.
- Do not invent requirements that are not supported by the context.
- Return only the improved task text, with no preamble.`;

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

	const prompt = [
		`## Delegation Context Mode\n${args.contextLabel}`,
		`## Current Conversation\n${conversationText}`,
		`## Rough Task\n${args.rawTask}`,
	].join("\n\n");

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
	resultText: string;
	status: string;
}): string {
	return [
		`<manual_teammate_invocation command="${escapeXml(args.commandName)}" teammate="${escapeXml(args.teammateName)}" context="${escapeXml(args.contextMode)}" status="${escapeXml(args.status)}">`,
		`<task>${escapeXml(args.task)}</task>`,
		args.sessionId ? `<session>${escapeXml(args.sessionId)}</session>` : "",
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
