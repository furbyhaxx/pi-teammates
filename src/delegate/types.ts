import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import type { TeammateContextMode } from "../context/modes.ts";

export interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

export interface SingleResult {
	teammate: string;
	teammateSource: "user" | "project" | "builtin" | "unknown";
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

export interface DelegateDetails {
	mode: "single" | "parallel" | "chain";
	projectTeammatesDir: string | null;
	collapsedItemCount: number;
	results: SingleResult[];
}

export type OnUpdateCallback = (partial: AgentToolResult<DelegateDetails>) => void;
