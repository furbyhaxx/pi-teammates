import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import type { UsageStats } from "./types.ts";

export function getTrackableMessages(messages: AgentMessage[]): Message[] {
	return messages.filter((message) => message.role === "assistant" || message.role === "toolResult") as Message[];
}

export function extractRunOutcome(messages: Message[]): { exitCode: number; stopReason?: string; errorMessage?: string; usage: UsageStats } {
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
