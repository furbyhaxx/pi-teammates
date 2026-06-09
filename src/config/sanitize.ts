import type { TeammatesContextConfig } from "../context/prompts.ts";
import { DEFAULT_TEAMMATES_CONFIG, TEAMMATES_CONTEXT_KEYS } from "./defaults.ts";
import { pickKnown } from "./merge.ts";
import type { TeammatesSettingsConfig } from "./types.ts";

export function sanitizeTeammatesSettings(value: TeammatesSettingsConfig): TeammatesSettingsConfig {
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
	if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
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
