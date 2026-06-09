import type { PiTeammatesConfig } from "./types.ts";

export const DEFAULT_TEAMMATES_CONFIG: PiTeammatesConfig = {
	teammates: {
		loadProjectTeammates: true,
		maxParallelTasks: 8,
		maxConcurrency: 4,
		collapsedItemCount: 10,
		perTaskOutputCap: 50 * 1024,
		toolAliases: {},
		context: {
			models: [],
			summaryModels: [],
			handoffModels: [],
		},
	},
};

export const TEAMMATES_KEYS = [
	"loadProjectTeammates",
	"maxParallelTasks",
	"maxConcurrency",
	"collapsedItemCount",
	"perTaskOutputCap",
	"toolAliases",
	"context",
] as const;

export const TEAMMATES_CONTEXT_KEYS = [
	"models",
	"summaryModels",
	"handoffModels",
	"summarySystemPrompt",
	"handoffSystemPrompt",
	"contextMaxChars",
] as const;
