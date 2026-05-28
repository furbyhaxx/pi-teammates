import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { TeammateContextMode } from "./context-transfer.ts";
import type { TeammatePromptMode } from "./teammates.ts";

export const TEAMMATE_JOB_CUSTOM_TYPE = "pi-teammates/job";

export type TeammateJobStatus = "running" | "completed" | "failed" | "aborted" | "interrupted";

export interface TeammateJobRecord {
	jobId: string;
	parentSessionId: string;
	parentSessionFile?: string;
	childSessionId: string;
	childSessionPath: string;
	teammateName: string;
	task: string;
	contextMode: TeammateContextMode;
	cwd: string;
	toolNames: string[];
	disableAllTools: boolean;
	promptMode: TeammatePromptMode;
	systemPrompt: string;
	status: TeammateJobStatus;
	model?: string;
	createdAt: string;
	updatedAt: string;
}

export function createTeammateJobRecord(args: {
	jobId: string;
	parentSessionId: string;
	parentSessionFile?: string;
	childSessionId: string;
	childSessionPath: string;
	teammateName: string;
	task: string;
	contextMode: TeammateContextMode;
	cwd: string;
	toolNames: string[];
	disableAllTools: boolean;
	promptMode: TeammatePromptMode;
	systemPrompt: string;
	status: TeammateJobStatus;
	model?: string;
	createdAt?: string;
}): TeammateJobRecord {
	const now = new Date().toISOString();
	return {
		jobId: args.jobId,
		parentSessionId: args.parentSessionId,
		parentSessionFile: args.parentSessionFile,
		childSessionId: args.childSessionId,
		childSessionPath: args.childSessionPath,
		teammateName: args.teammateName,
		task: args.task,
		contextMode: args.contextMode,
		cwd: args.cwd,
		toolNames: args.toolNames,
		disableAllTools: args.disableAllTools,
		promptMode: args.promptMode,
		systemPrompt: args.systemPrompt,
		status: args.status,
		model: args.model,
		createdAt: args.createdAt ?? now,
		updatedAt: now,
	};
}

export function updateTeammateJobRecord(record: TeammateJobRecord, status: TeammateJobStatus): TeammateJobRecord {
	return {
		...record,
		status,
		updatedAt: new Date().toISOString(),
	};
}

export function collectLatestTeammateJobs(entries: SessionEntry[]): Map<string, TeammateJobRecord> {
	const jobs = new Map<string, TeammateJobRecord>();
	for (const entry of entries) {
		if (entry.type !== "custom" || entry.customType !== TEAMMATE_JOB_CUSTOM_TYPE) continue;
		const data = isTeammateJobRecord(entry.data) ? normalizeInterrupted(entry.data) : undefined;
		if (!data) continue;
		jobs.set(data.childSessionId, data);
	}
	return jobs;
}

function normalizeInterrupted(record: TeammateJobRecord): TeammateJobRecord {
	if (record.status !== "running") return record;
	return {
		...record,
		status: "interrupted",
	};
}

function isTeammateJobRecord(value: unknown): value is TeammateJobRecord {
	if (!value || typeof value !== "object") return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.jobId === "string" &&
		typeof record.parentSessionId === "string" &&
		typeof record.childSessionId === "string" &&
		typeof record.childSessionPath === "string" &&
		typeof record.teammateName === "string" &&
		typeof record.task === "string" &&
		typeof record.contextMode === "string" &&
		typeof record.cwd === "string" &&
		Array.isArray(record.toolNames) &&
		typeof record.disableAllTools === "boolean" &&
		typeof record.promptMode === "string" &&
		typeof record.systemPrompt === "string" &&
		typeof record.status === "string" &&
		typeof record.createdAt === "string" &&
		typeof record.updatedAt === "string"
	);
}
