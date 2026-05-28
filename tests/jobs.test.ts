import assert from "node:assert/strict";
import {
	collectLatestTeammateJobs,
	createTeammateJobRecord,
	TEAMMATE_JOB_CUSTOM_TYPE,
	updateTeammateJobRecord,
} from "../src/job-registry.ts";

const running = createTeammateJobRecord({
	jobId: "job-1",
	parentSessionId: "parent-1",
	parentSessionFile: "/tmp/parent.jsonl",
	childSessionId: "child-1",
	childSessionPath: "/tmp/child-1.jsonl",
	teammateName: "scout",
	task: "Inspect auth flow",
	contextMode: "summary",
	cwd: "/repo",
	toolNames: ["read", "grep"],
	disableAllTools: false,
	promptMode: "append",
	systemPrompt: "Scout prompt",
	status: "running",
	model: "deepseek/deepseek-v4-flash:high",
	createdAt: "2026-05-28T00:00:00.000Z",
});

const completed = updateTeammateJobRecord(running, "completed");

const jobs = collectLatestTeammateJobs([
	{
		type: "custom",
		id: "1",
		parentId: null,
		timestamp: "2026-05-28T00:00:00.000Z",
		customType: TEAMMATE_JOB_CUSTOM_TYPE,
		data: running,
	},
	{
		type: "custom",
		id: "2",
		parentId: "1",
		timestamp: "2026-05-28T00:01:00.000Z",
		customType: TEAMMATE_JOB_CUSTOM_TYPE,
		data: completed,
	},
]);

assert.equal(jobs.get("child-1")?.status, "completed");

const interrupted = collectLatestTeammateJobs([
	{
		type: "custom",
		id: "3",
		parentId: null,
		timestamp: "2026-05-28T00:00:00.000Z",
		customType: TEAMMATE_JOB_CUSTOM_TYPE,
		data: running,
	},
]);

assert.equal(interrupted.get("child-1")?.status, "interrupted");
console.log("job registry tests passed");
