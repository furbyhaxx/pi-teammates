import assert from "node:assert/strict";
import {
	createTeammateSessionState,
	getLatestTeammateSessionState,
	TEAMMATE_STATE_CUSTOM_TYPE,
} from "../src/teammate-state.ts";

const state = createTeammateSessionState({
	teammateName: "worker",
	contextMode: "inherit",
	lineage: ["planner", "worker", "worker"],
	parentSessionId: "parent-1",
});
assert.deepEqual(state.lineage, ["planner", "worker"]);

const latest = getLatestTeammateSessionState([
	{
		type: "custom",
		id: "1",
		parentId: null,
		timestamp: "2026-05-28T00:00:00.000Z",
		customType: TEAMMATE_STATE_CUSTOM_TYPE,
		data: { teammateName: "worker", contextMode: "inherit", lineage: ["planner", "worker"] },
	},
	{
		type: "custom",
		id: "2",
		parentId: "1",
		timestamp: "2026-05-28T00:01:00.000Z",
		customType: TEAMMATE_STATE_CUSTOM_TYPE,
		data: { teammateName: "reviewer", contextMode: "handoff", lineage: ["planner", "worker", "reviewer"] },
	},
]);

assert.deepEqual(latest, {
	teammateName: "reviewer",
	contextMode: "handoff",
	lineage: ["planner", "worker", "reviewer"],
});

console.log("teammate state tests passed");
