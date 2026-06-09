import type { TeammateJobRecord, TeammateJobRecordInput, TeammateJobStatus } from "./types.ts";

export function createTeammateJobRecord(args: {
	jobId: string;
	parentSessionId: string;
	parentSessionFile?: string;
	childSessionId: string;
	childSessionPath: string;
	teammateName: string;
	source?: "user" | "project" | "builtin";
	task: string;
	contextMode: TeammateJobRecord["contextMode"];
	cwd: string;
	toolNames: string[];
	disableAllTools: boolean;
	skills?: string[];
	promptMode: TeammateJobRecord["promptMode"];
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
		source: args.source,
		task: args.task,
		contextMode: args.contextMode,
		cwd: args.cwd,
		toolNames: args.toolNames,
		disableAllTools: args.disableAllTools,
		skills: parseSkillNames(args.skills),
		promptMode: args.promptMode,
		systemPrompt: args.systemPrompt,
		status: args.status,
		model: args.model,
		createdAt: args.createdAt ?? now,
		updatedAt: now,
	};
}

export function updateTeammateJobRecord(
	record: TeammateJobRecord,
	status: TeammateJobStatus,
	overrides: Partial<Pick<TeammateJobRecord, "model">> = {},
): TeammateJobRecord {
	return {
		...record,
		...overrides,
		status,
		updatedAt: new Date().toISOString(),
	};
}

export function normalizeJobRecord(record: TeammateJobRecordInput): TeammateJobRecord {
	return {
		...record,
		skills: parseSkillNames(record.skills),
	};
}

export function isTeammateJobRecord(value: unknown): value is TeammateJobRecordInput {
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
		(record.skills === undefined || Array.isArray(record.skills)) &&
		typeof record.promptMode === "string" &&
		typeof record.systemPrompt === "string" &&
		typeof record.status === "string" &&
		typeof record.createdAt === "string" &&
		typeof record.updatedAt === "string"
	);
}

function parseSkillNames(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((skill): skill is string => typeof skill === "string")
		.map((skill) => skill.trim())
		.filter((skill) => skill.length > 0);
}
