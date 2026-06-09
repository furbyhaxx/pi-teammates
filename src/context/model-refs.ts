import type { ThinkingLevel } from "@earendil-works/pi-ai";

import { uniqueBy } from "../shared/arrays.ts";
import type { TeammateContextMode } from "./modes.ts";
import type { TeammatesContextConfig } from "./prompts.ts";

export interface ParsedContextModelRef {
	provider: string;
	id: string;
	thinking?: ThinkingLevel;
}

interface ResolveConfiguredContextModelRefsArgs {
	mode: TeammateContextMode;
	config: TeammatesContextConfig;
	defaultProvider?: string;
}

const THINKING_LEVELS = new Set<ThinkingLevel>([
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
]);

export function parseContextModelRef(
	value: string | undefined,
	defaultProvider?: string,
): ParsedContextModelRef | undefined {
	const trimmed = value?.trim();
	if (!trimmed) return undefined;

	const slash = trimmed.indexOf("/");
	const provider = slash > 0 ? trimmed.slice(0, slash) : defaultProvider;
	let id = slash > 0 ? trimmed.slice(slash + 1) : trimmed;
	if (!provider || !id) return undefined;

	let thinking: ThinkingLevel | undefined;
	const colon = id.lastIndexOf(":");
	if (colon > 0) {
		const suffix = id.slice(colon + 1);
		if (!THINKING_LEVELS.has(suffix as ThinkingLevel)) return undefined;
		thinking = suffix as ThinkingLevel;
		id = id.slice(0, colon);
	}
	if (!id) return undefined;
	return { provider, id, thinking };
}

export function resolveConfiguredContextModelRefs(args: ResolveConfiguredContextModelRefsArgs): ParsedContextModelRef[] {
	const configuredValues =
		args.mode === "summary" && args.config.summaryModels.length > 0
			? args.config.summaryModels
			: args.mode === "handoff" && args.config.handoffModels.length > 0
				? args.config.handoffModels
				: args.config.models;

	const refs = configuredValues
		.map((value) => parseContextModelRef(value, args.defaultProvider))
		.filter((value): value is ParsedContextModelRef => value !== undefined);
	return uniqueBy(refs, (ref) => `${ref.provider}/${ref.id}:${ref.thinking ?? ""}`);
}
