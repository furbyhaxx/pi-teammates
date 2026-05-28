import { existsSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir, SettingsManager } from "@earendil-works/pi-coding-agent";

export interface TeammatesSettingsConfig {
	loadProjectTeammates: boolean;
	maxParallelTasks: number;
	maxConcurrency: number;
	collapsedItemCount: number;
	perTaskOutputCap: number;
	toolAliases: Record<string, string[]>;
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

export const DEFAULT_TEAMMATES_CONFIG: PiTeammatesConfig = {
	teammates: {
		loadProjectTeammates: true,
		maxParallelTasks: 8,
		maxConcurrency: 4,
		collapsedItemCount: 10,
		perTaskOutputCap: 50 * 1024,
		toolAliases: {},
	},
};

const TEAMMATES_KEYS = [
	"loadProjectTeammates",
	"maxParallelTasks",
	"maxConcurrency",
	"collapsedItemCount",
	"perTaskOutputCap",
	"toolAliases",
] as const;

export function loadTeammatesConfig(
	cwd: string,
	agentDir = getAgentDir(),
): LoadedTeammatesConfig {
	const manager = SettingsManager.create(cwd, agentDir);
	const globalSettings = normalizeConfigAliases(manager.getGlobalSettings()) as {
		teammates?: Record<string, unknown>;
	};
	const projectSettings = normalizeConfigAliases(manager.getProjectSettings()) as {
		teammates?: Record<string, unknown>;
	};

	const merged = deepMerge(
		deepMerge(DEFAULT_TEAMMATES_CONFIG, {
			teammates: pickKnown(globalSettings.teammates, TEAMMATES_KEYS),
		}),
		{ teammates: pickKnown(projectSettings.teammates, TEAMMATES_KEYS) },
	);

	return {
		config: {
			teammates: sanitizeTeammatesSettings(merged.teammates),
		},
		sources: settingsSources(cwd, agentDir),
	};
}

function sanitizeTeammatesSettings(value: TeammatesSettingsConfig): TeammatesSettingsConfig {
	return {
		loadProjectTeammates:
			typeof value.loadProjectTeammates === "boolean"
				? value.loadProjectTeammates
				: DEFAULT_TEAMMATES_CONFIG.teammates.loadProjectTeammates,
		maxParallelTasks: positiveIntegerOrDefault(
			value.maxParallelTasks,
			DEFAULT_TEAMMATES_CONFIG.teammates.maxParallelTasks,
		),
		maxConcurrency: positiveIntegerOrDefault(
			value.maxConcurrency,
			DEFAULT_TEAMMATES_CONFIG.teammates.maxConcurrency,
		),
		collapsedItemCount: positiveIntegerOrDefault(
			value.collapsedItemCount,
			DEFAULT_TEAMMATES_CONFIG.teammates.collapsedItemCount,
		),
		perTaskOutputCap: positiveIntegerOrDefault(
			value.perTaskOutputCap,
			DEFAULT_TEAMMATES_CONFIG.teammates.perTaskOutputCap,
		),
		toolAliases: sanitizeToolAliases(value.toolAliases),
	};
}

function sanitizeToolAliases(value: unknown): Record<string, string[]> {
	if (!isPlainObject(value)) return {};
	const out: Record<string, string[]> = {};
	for (const [key, aliasValue] of Object.entries(value)) {
		if (!Array.isArray(aliasValue)) continue;
		const aliases = aliasValue
			.filter((item): item is string => typeof item === "string")
			.map((item) => item.trim())
			.filter((item, index, list) => item.length > 0 && list.indexOf(item) === index);
		if (aliases.length > 0) out[key] = aliases;
	}
	return out;
}

function positiveIntegerOrDefault(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function settingsSources(cwd: string, agentDir: string): string[] {
	return [join(agentDir, "settings.json"), join(cwd, ".pi", "settings.json")].filter((path) => existsSync(path));
}

export function deepMerge<T>(base: T, override: DeepPartial<T> | undefined): T {
	if (override === undefined) return clone(base);
	if (!isPlainObject(base) || !isPlainObject(override)) {
		return clone(override as T);
	}

	const merged: Record<string, unknown> = {
		...(base as Record<string, unknown>),
	};
	for (const [key, value] of Object.entries(override)) {
		if (value === undefined) continue;
		const current = merged[key];
		if (isPlainObject(current) && isPlainObject(value)) {
			merged[key] = deepMerge(current, value as Record<string, unknown>);
		} else {
			merged[key] = clone(value);
		}
	}
	return merged as T;
}

function pickKnown(value: unknown, keys: readonly string[]): Record<string, unknown> {
	if (!isPlainObject(value)) return {};
	const out: Record<string, unknown> = {};
	for (const key of keys) {
		if (Object.hasOwn(value, key)) out[key] = value[key];
	}
	return out;
}

function normalizeConfigAliases(value: unknown): unknown {
	if (Array.isArray(value)) return value.map((item) => normalizeConfigAliases(item));
	if (!isPlainObject(value)) return value;

	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [
			snakeToCamel(key),
			normalizeConfigAliases(item),
		]),
	);
}

function snakeToCamel(key: string): string {
	return key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function clone<T>(value: T): T {
	if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
	if (isPlainObject(value)) {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [key, clone(item)]),
		) as T;
	}
	return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
