import type { TeammateConfig } from "./teammates.ts";

export interface ResolveTeammateToolNamesArgs {
	activeTools: string[];
	toolToggles?: Record<string, boolean>;
	toolAliases: Record<string, string[]>;
	delegateEnabled: boolean;
}

export interface CanDelegateToTeammateArgs {
	targetName: string;
	lineage: string[];
}

export function resolveTeammateToolNames(args: ResolveTeammateToolNamesArgs): string[] {
	const activeTools = unique(args.activeTools);
	const activeSet = new Set(activeTools);
	const toggles = args.toolToggles ?? {};
	const positiveEntries = Object.entries(toggles).filter(([, enabled]) => enabled === true);
	const selected = new Set<string>(positiveEntries.length > 0 ? [] : activeTools);

	for (const [toolName] of positiveEntries) {
		for (const expanded of expandToolName(toolName, args.toolAliases)) {
			if (activeSet.has(expanded)) selected.add(expanded);
		}
	}

	for (const [toolName, enabled] of Object.entries(toggles)) {
		if (enabled !== false) continue;
		for (const expanded of expandToolName(toolName, args.toolAliases)) {
			selected.delete(expanded);
		}
	}

	if (args.delegateEnabled) {
		if (activeSet.has("delegate") && toggles.delegate !== false) selected.add("delegate");
	} else {
		selected.delete("delegate");
	}

	return activeTools.filter((toolName) => selected.has(toolName));
}

export function canDelegateToTeammate(args: CanDelegateToTeammateArgs): boolean {
	return !args.lineage.includes(args.targetName);
}

export function buildTeamPromptBlock<T extends Pick<TeammateConfig, "name" | "description">>(teammates: T[]): string {
	const members = teammates
		.map(
			(teammate) =>
				`<member name="${escapeXml(teammate.name)}">${escapeXml(teammate.description)}</member>`,
		)
		.join("\n");

	return [
		"Below is a list of your teammates with their specializations, capabilities and domains. Use this information to delegate narrow, concrete work that benefits from a fresh context window or teammate-specific tools, prompts, or model settings. Delegate execution, not judgment: decide what needs to be done, pass the relevant files and constraints, and ask for the exact output you want back.",
		"<team>",
		members,
		"</team>",
	].join("\n");
}

function expandToolName(toolName: string, toolAliases: Record<string, string[]>): string[] {
	return unique([toolName, ...(toolAliases[toolName] ?? [])]);
}

function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

function unique(values: string[]): string[] {
	return values.filter((value, index) => values.indexOf(value) === index);
}
