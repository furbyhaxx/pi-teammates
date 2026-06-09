import assert from "node:assert/strict";
import {
	buildDelegatedUserTask,
	parseContextModelRef,
	parseTeammateContextMode,
	resolveConfiguredContextModelRefs,
	selectContextMode,
} from "../src/context-transfer.ts";
import {
	parseTeammateContextMode as parseTeammateContextModeFromContextIndex,
	selectContextMode as selectContextModeFromContextIndex,
} from "../src/context/index.ts";

assert.equal(parseTeammateContextMode(undefined), "new");
assert.equal(parseTeammateContextMode("inherit"), "inherit");
assert.equal(parseTeammateContextMode("summary"), "summary");
assert.equal(parseTeammateContextMode("handoff"), "handoff");
assert.equal(parseTeammateContextMode("bogus"), "new");
assert.equal(parseTeammateContextModeFromContextIndex("summary"), "summary");
assert.equal(selectContextModeFromContextIndex(undefined, "handoff"), "handoff");

assert.deepEqual(parseContextModelRef("deepseek/deepseek-v4-flash:high"), {
	provider: "deepseek",
	id: "deepseek-v4-flash",
	thinking: "high",
});
assert.deepEqual(parseContextModelRef("gpt-5.5:xhigh", "openai-codex"), {
	provider: "openai-codex",
	id: "gpt-5.5",
	thinking: "xhigh",
});
assert.equal(parseContextModelRef("deepseek/"), undefined);
assert.equal(parseContextModelRef("deepseek/deepseek-v4-flash:ultra"), undefined);

assert.deepEqual(
	resolveConfiguredContextModelRefs({
		mode: "summary",
		config: {
			models: ["deepseek/deepseek-v4-flash:high"],
			summaryModels: ["github-copilot/gpt-5.4-mini"],
			handoffModels: ["deepseek/deepseek-v4-pro"],
		},
		defaultProvider: "deepseek",
	}),
	[{ provider: "github-copilot", id: "gpt-5.4-mini", thinking: undefined }],
);

assert.deepEqual(
	resolveConfiguredContextModelRefs({
		mode: "handoff",
		config: {
			models: ["deepseek/deepseek-v4-flash:high"],
			summaryModels: [],
			handoffModels: [],
		},
		defaultProvider: "deepseek",
	}),
	[{ provider: "deepseek", id: "deepseek-v4-flash", thinking: "high" }],
);

assert.equal(selectContextMode(undefined, "summary"), "summary");
assert.equal(selectContextMode("handoff", "summary"), "handoff");

assert.equal(
	buildDelegatedUserTask({
		mode: "new",
		task: "Inspect src/index.ts",
	}),
	"Task: Inspect src/index.ts",
);

assert.equal(
	buildDelegatedUserTask({
		mode: "summary",
		task: "Implement the next step",
		generatedContext: "## Summary\nImportant findings",
	}),
	[
		"<delegation_context mode=\"summary\">",
		"## Summary",
		"Important findings",
		"</delegation_context>",
		"",
		"<delegated_task>",
		"Implement the next step",
		"</delegated_task>",
	].join("\n"),
);

console.log("context transfer tests passed");
