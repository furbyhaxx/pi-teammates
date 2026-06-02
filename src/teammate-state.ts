import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { TeammateContextMode } from "./context-transfer.ts";

export const TEAMMATE_STATE_CUSTOM_TYPE = "pi-teammates/state";

export interface TeammateSessionState {
	teammateName: string;
	contextMode: TeammateContextMode;
	lineage: string[];
	parentSessionId?: string;
	parentJobId?: string;
}

export function createTeammateSessionState(args: {
	teammateName: string;
	contextMode: TeammateContextMode;
	lineage: string[];
	parentSessionId?: string;
	parentJobId?: string;
}): TeammateSessionState {
	return {
		teammateName: args.teammateName,
		contextMode: args.contextMode,
		lineage: uniqueStrings(args.lineage),
		parentSessionId: args.parentSessionId,
		parentJobId: args.parentJobId,
	};
}

export function getLatestTeammateSessionState(entries: SessionEntry[]): TeammateSessionState | undefined {
	let latest: TeammateSessionState | undefined;
	for (const entry of entries) {
		if (entry.type !== "custom" || entry.customType !== TEAMMATE_STATE_CUSTOM_TYPE) continue;
		if (!isTeammateSessionState(entry.data)) continue;
		latest = normalizeState(entry.data);
	}
	return latest;
}

function normalizeState(state: TeammateSessionState): TeammateSessionState {
	return {
		...state,
		lineage: uniqueStrings(state.lineage),
	};
}

function isTeammateSessionState(value: unknown): value is TeammateSessionState {
	if (!value || typeof value !== "object") return false;
	const state = value as Record<string, unknown>;
	return (
		typeof state.teammateName === "string" &&
		typeof state.contextMode === "string" &&
		Array.isArray(state.lineage)
	);
}

function uniqueStrings(values: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const value of values) {
		if (typeof value !== "string" || !value.trim() || seen.has(value)) continue;
		seen.add(value);
		result.push(value);
	}
	return result;
}
