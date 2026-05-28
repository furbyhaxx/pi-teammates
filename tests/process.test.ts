import assert from "node:assert/strict";
import {
	buildDelegateProcessPlan,
	parseTeammatesLineage,
} from "../src/delegate-process.ts";

assert.deepEqual(parseTeammatesLineage(undefined), []);
assert.deepEqual(parseTeammatesLineage(""), []);
assert.deepEqual(parseTeammatesLineage("not json"), []);
assert.deepEqual(parseTeammatesLineage('["planner","worker"]'), ["planner", "worker"]);

const replacePlan = buildDelegateProcessPlan({
	defaultCwd: "/repo",
	task: "Inspect src/index.ts",
	cwd: undefined,
	promptFilePath: "/tmp/prompt-replace.md",
	promptMode: "replace",
	model: "deepseek/deepseek-v4-flash:high",
	tools: ["read", "shell_exec"],
	disableAllTools: false,
	teammateName: "scout",
	lineage: ["planner"],
	env: { HOME: "/home/tester" },
});
assert.equal(replacePlan.cwd, "/repo");
assert.deepEqual(replacePlan.args, [
	"--mode",
	"json",
	"-p",
	"--no-session",
	"--model",
	"deepseek/deepseek-v4-flash:high",
	"--tools",
	"read,shell_exec",
	"--system-prompt",
	"/tmp/prompt-replace.md",
	"Inspect src/index.ts",
]);
assert.equal(replacePlan.env.PI_TEAMMATES_CURRENT, "scout");
assert.equal(replacePlan.env.PI_TEAMMATES_LINEAGE, '["planner","scout"]');

const appendPlan = buildDelegateProcessPlan({
	defaultCwd: "/repo",
	task: "Review changes",
	cwd: "/repo/subdir",
	promptFilePath: "/tmp/prompt-append.md",
	promptMode: "append",
	model: undefined,
	tools: [],
	disableAllTools: true,
	teammateName: "reviewer",
	lineage: [],
	env: {},
});
assert.equal(appendPlan.cwd, "/repo/subdir");
assert.deepEqual(appendPlan.args, [
	"--mode",
	"json",
	"-p",
	"--no-session",
	"--no-tools",
	"--append-system-prompt",
	"/tmp/prompt-append.md",
	"Review changes",
]);
assert.equal(appendPlan.env.PI_TEAMMATES_CURRENT, "reviewer");
assert.equal(appendPlan.env.PI_TEAMMATES_LINEAGE, '["reviewer"]');

const inheritPlan = buildDelegateProcessPlan({
	defaultCwd: "/repo",
	task: "Continue the current work",
	cwd: undefined,
	sessionFilePath: "/tmp/inherit-session.jsonl",
	promptMode: "append",
	model: "github-copilot/gpt-5.4-mini",
	tools: ["read", "delegate"],
	disableAllTools: false,
	teammateName: "worker",
	lineage: ["planner"],
	env: {},
});
assert.deepEqual(inheritPlan.args, [
	"--mode",
	"json",
	"-p",
	"--session",
	"/tmp/inherit-session.jsonl",
	"--model",
	"github-copilot/gpt-5.4-mini",
	"--tools",
	"read,delegate",
	"Continue the current work",
]);
assert.equal(inheritPlan.env.PI_TEAMMATES_LINEAGE, '["planner","worker"]');

console.log("delegate process tests passed");
