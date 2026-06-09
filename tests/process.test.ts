import assert from "node:assert/strict";
import {
	parseTeammatesLineage,
} from "../src/teammates/process.ts";

assert.deepEqual(parseTeammatesLineage(undefined), []);
assert.deepEqual(parseTeammatesLineage(""), []);
assert.deepEqual(parseTeammatesLineage("not json"), []);
assert.deepEqual(parseTeammatesLineage('["planner","worker"]'), ["planner", "worker"]);
assert.deepEqual(parseTeammatesLineage('[1, "worker", null]'), ["worker"]);
assert.deepEqual(parseTeammatesLineage("{}"), []);

console.log("delegate process tests passed");
