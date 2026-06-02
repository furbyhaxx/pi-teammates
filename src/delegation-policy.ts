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

export function buildTeamPromptBlock<T extends Pick<TeammateConfig, "name" | "description" | "contextMode">>(teammates: T[]): string {
	const members = teammates
		.map(
			(teammate) =>
				`<member name="${escapeXml(teammate.name)}" context="${escapeXml(teammate.contextMode)}">${escapeXml(teammate.description)}</member>`,
		)
		.join("\n");

	return [
		"<delegation_policy>",
		"Decompose work before calling delegate: identify all independent workstreams and sequential dependencies, then batch them into one call — N independent tasks into one `tasks` call (parallel), a sequential pipeline into one `chain` call.",
		"Never make multiple sequential delegate calls for independent subtasks. Use `tasks` to run them in parallel — parallel costs zero extra wall-clock time and is the default mode for independent work.",
		"If you are about to emit more than one delegate call for subtasks that do not depend on each other, collapse them into a single `tasks` call instead — multiple delegate calls in one turn for independent work is the same mistake as making them sequentially.",
		"Use delegation only for bounded execution tasks where specialization, isolation, or parallelism clearly helps.",
		"Do not delegate when you can complete the work directly from the current context without losing quality.",
		"Delegate execution, not judgment. Decide the real task yourself before calling `delegate`.",
		"Every delegated task should include the concrete goal, relevant files or symbols when known, important constraints or risks, and the expected output.",
		"Do not send vague prompts like \"look into this\", \"handle it\", or \"fix the bug\" without the actual scoped brief.",
		"Choose context deliberately: `new` for self-contained tasks, `summary` for fresh workers that need broader background, `handoff` for one specific next-step execution brief, and `inherit` only when transcript continuity is truly required.",
		"The `context` attribute on each team member shows their configured default context mode — prefer it unless you have a specific reason to override.",
		"After a teammate returns, integrate the result yourself or issue a tighter follow-up; do not assume the child owns the conversation.",
		"</delegation_policy>",
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
	return [...new Set(values)];
}
