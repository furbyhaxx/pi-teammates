import type { TeammateContextMode } from "../context/modes.ts";
import type { TeammatePromptMode } from "../teammates/types.ts";

export const TEAMMATE_JOB_CUSTOM_TYPE = "pi-teammates/job";

export type TeammateJobStatus = "running" | "completed" | "failed" | "aborted" | "interrupted";

export interface TeammateJobRecord {
	jobId: string;
	parentSessionId: string;
	parentSessionFile?: string;
	childSessionId: string;
	childSessionPath: string;
	teammateName: string;
	/** Whether this teammate came from user, project, or builtin scope. */
	source?: "user" | "project" | "builtin";
	task: string;
	contextMode: TeammateContextMode;
	cwd: string;
	toolNames: string[];
	disableAllTools: boolean;
	skills: string[];
	promptMode: TeammatePromptMode;
	systemPrompt: string;
	status: TeammateJobStatus;
	model?: string;
	createdAt: string;
	updatedAt: string;
}

export type TeammateJobRecordInput = Omit<TeammateJobRecord, "skills"> & { skills?: unknown };
