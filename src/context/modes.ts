export const TEAMMATE_CONTEXT_MODES = ["new", "inherit", "summary", "handoff"] as const;
export type TeammateContextMode = (typeof TEAMMATE_CONTEXT_MODES)[number];

export function parseTeammateContextMode(value: unknown): TeammateContextMode {
	return typeof value === "string" && TEAMMATE_CONTEXT_MODES.includes(value as TeammateContextMode)
		? (value as TeammateContextMode)
		: "new";
}

export function selectContextMode(
	overrideMode: TeammateContextMode | undefined,
	defaultMode: TeammateContextMode,
): TeammateContextMode {
	return overrideMode ?? defaultMode;
}
