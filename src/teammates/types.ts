import type { TeammateContextMode } from "../context/modes.ts";

export type TeammateSource = "user" | "project" | "builtin";
export type TeammatePromptMode = "append" | "replace";

export interface TeammateConfig {
	name: string;
	description: string;
	tools?: Record<string, boolean>;
	skills: string[];
	model?: string;
	contextMode: TeammateContextMode;
	promptMode: TeammatePromptMode;
	systemPrompt: string;
	source: TeammateSource;
	filePath: string;
}

export interface TeammateDiscoveryResult {
	teammates: TeammateConfig[];
	projectTeammatesDir: string | null;
	usingBuiltins: boolean;
	/** Paths of teammate files that failed to parse, with error messages. */
	warnings: string[];
}

export interface DiscoverTeammatesOptions {
	agentDir?: string;
	loadProjectTeammates?: boolean;
}
