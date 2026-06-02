import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir, SettingsManager } from "@earendil-works/pi-coding-agent";
import type { TeammatesContextConfig } from "./context-transfer.ts";

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

const TEAMMATES_KEYS = [
	"loadProjectTeammates",
	"maxParallelTasks",
	"maxConcurrency",
	"collapsedItemCount",
	"perTaskOutputCap",
	"toolAliases",
	"context",
] as const;

const TEAMMATES_CONTEXT_KEYS = [
	"models",
	"summaryModels",
	"handoffModels",
	"summarySystemPrompt",
	"handoffSystemPrompt",
	"contextMaxChars",
] as const;

// ─── mtime-based config cache ────────────────────────────────────────────────

interface ConfigCacheEntry {
	result: LoadedTeammatesConfig;
	mtimes: Record<string, number>;
}
const _configCache = new Map<string, ConfigCacheEntry>();

function getSettingsMtimes(cwd: string, agentDir: string): Record<string, number> {
	const paths = [join(agentDir, "settings.json"), join(cwd, ".pi", "settings.json")];
	const mtimes: Record<string, number> = {};
	for (const p of paths) {
		try {
			mtimes[p] = statSync(p).mtimeMs;
		} catch {
			mtimes[p] = 0;
		}
	}
	return mtimes;
}

function mtimesEqual(a: Record<string, number>, b: Record<string, number>): boolean {
	const keysA = Object.keys(a);
	if (keysA.length !== Object.keys(b).length) return false;
	return keysA.every((k) => a[k] === b[k]);
}

// ─────────────────────────────────────────────────────────────────────────────

export function loadTeammatesConfig(
	cwd: string,
	agentDir = getAgentDir(),
): LoadedTeammatesConfig {
	const currentMtimes = getSettingsMtimes(cwd, agentDir);
	const cacheKey = `${agentDir}::${cwd}`;
	const cached = _configCache.get(cacheKey);
	if (cached && mtimesEqual(cached.mtimes, currentMtimes)) {
		return cached.result;
	}

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

	const result: LoadedTeammatesConfig = {
		config: {
			teammates: sanitizeTeammatesSettings(merged.teammates),
		},
		sources: settingsSources(cwd, agentDir),
	};
	_configCache.set(cacheKey, { result, mtimes: currentMtimes });
	return result;
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
		context: sanitizeContextConfig(value.context),
	};
}

function sanitizeContextConfig(value: unknown): TeammatesContextConfig {
	const context = pickKnown(value, TEAMMATES_CONTEXT_KEYS);
	const result: TeammatesContextConfig = {
		models: sanitizeStringList(context.models),
		summaryModels: sanitizeStringList(context.summaryModels),
		handoffModels: sanitizeStringList(context.handoffModels),
	};
	const summaryPrompt = typeof context.summarySystemPrompt === "string" ? context.summarySystemPrompt.trim() : "";
	if (summaryPrompt) result.summarySystemPrompt = summaryPrompt;
	const handoffPrompt = typeof context.handoffSystemPrompt === "string" ? context.handoffSystemPrompt.trim() : "";
	if (handoffPrompt) result.handoffSystemPrompt = handoffPrompt;
	if (
		typeof context.contextMaxChars === "number" &&
		Number.isInteger(context.contextMaxChars) &&
		context.contextMaxChars > 0
	) {
		result.contextMaxChars = context.contextMaxChars;
	}
	return result;
}

function sanitizeToolAliases(value: unknown): Record<string, string[]> {
	if (!isPlainObject(value)) return {};
	const out: Record<string, string[]> = {};
	for (const [key, aliasValue] of Object.entries(value)) {
		if (!Array.isArray(aliasValue)) continue;
		const aliases = sanitizeStringList(aliasValue);
		if (aliases.length > 0) out[key] = aliases;
	}
	return out;
}

function sanitizeStringList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	const result: string[] = [];
	for (const item of value) {
		if (typeof item !== "string") continue;
		const trimmed = item.trim();
		if (!trimmed || seen.has(trimmed)) continue;
		seen.add(trimmed);
		result.push(trimmed);
	}
	return result;
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
