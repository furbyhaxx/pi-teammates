import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { isTeammateJobRecord, normalizeJobRecord } from "./records.ts";
import { TEAMMATE_JOB_CUSTOM_TYPE, type TeammateJobRecord } from "./types.ts";

export function collectLatestTeammateJobs(entries: SessionEntry[]): Map<string, TeammateJobRecord> {
	const jobs = new Map<string, TeammateJobRecord>();
	for (const entry of entries) {
		if (entry.type !== "custom" || entry.customType !== TEAMMATE_JOB_CUSTOM_TYPE) continue;
		const data = isTeammateJobRecord(entry.data) ? normalizeJobRecord(entry.data) : undefined;
		if (!data) continue;
		jobs.set(data.childSessionId, data);
	}
	return jobs;
}

export function collectInterruptedTeammateJobs(entries: SessionEntry[]): TeammateJobRecord[] {
	return Array.from(collectLatestTeammateJobs(entries).values()).filter((record) => record.status === "running");
}

export function findTeammateJob(sessionEntries: SessionEntry[], sessionId: string): TeammateJobRecord | undefined {
	return collectLatestTeammateJobs(sessionEntries).get(sessionId);
}
