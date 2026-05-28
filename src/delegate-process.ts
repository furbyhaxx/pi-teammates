import type { TeammatePromptMode } from "./teammates.ts";

export const TEAMMATES_CURRENT_ENV = "PI_TEAMMATES_CURRENT";
export const TEAMMATES_LINEAGE_ENV = "PI_TEAMMATES_LINEAGE";

export interface BuildDelegateProcessPlanArgs {
	defaultCwd: string;
	task: string;
	cwd?: string;
	promptFilePath?: string;
	promptMode: TeammatePromptMode;
	model?: string;
	tools: string[];
	disableAllTools: boolean;
	teammateName: string;
	lineage: string[];
	env: NodeJS.ProcessEnv;
}

export interface DelegateProcessPlan {
	args: string[];
	cwd: string;
	env: NodeJS.ProcessEnv;
}

export function buildDelegateProcessPlan(args: BuildDelegateProcessPlanArgs): DelegateProcessPlan {
	const invocationArgs: string[] = ["--mode", "json", "-p", "--no-session"];
	if (args.model) invocationArgs.push("--model", args.model);
	if (args.disableAllTools) {
		invocationArgs.push("--no-tools");
	} else if (args.tools.length > 0) {
		invocationArgs.push("--tools", args.tools.join(","));
	}
	if (args.promptFilePath) {
		invocationArgs.push(
			args.promptMode === "replace" ? "--system-prompt" : "--append-system-prompt",
			args.promptFilePath,
		);
	}
	invocationArgs.push(`Task: ${args.task}`);

	const nextLineage = [...args.lineage, args.teammateName];
	return {
		args: invocationArgs,
		cwd: args.cwd ?? args.defaultCwd,
		env: {
			...args.env,
			[TEAMMATES_CURRENT_ENV]: args.teammateName,
			[TEAMMATES_LINEAGE_ENV]: JSON.stringify(nextLineage),
		},
	};
}

export function parseTeammatesLineage(value: string | undefined): string[] {
	if (!value) return [];
	try {
		const parsed = JSON.parse(value);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((item): item is string => typeof item === "string");
	} catch {
		return [];
	}
}
