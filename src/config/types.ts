import type { TeammatesContextConfig } from "../context/prompts.ts";

export interface TeammatesSettingsConfig {
	loadProjectTeammates: boolean;
	maxParallelTasks: number;
	maxConcurrency: number;
	collapsedItemCount: number;
	perTaskOutputCap: number;
	toolAliases: Record<string, string[]>;
	context: TeammatesContextConfig;
}

export interface PiTeammatesConfig {
	teammates: TeammatesSettingsConfig;
}

export interface LoadedTeammatesConfig {
	config: PiTeammatesConfig;
	sources: string[];
}

export type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends Array<infer U>
		? U[]
		: T[P] extends object
			? DeepPartial<T[P]>
			: T[P];
};
