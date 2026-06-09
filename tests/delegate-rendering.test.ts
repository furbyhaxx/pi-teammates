import assert from "node:assert/strict";
import teammatesExtension from "../src/index.ts";

function plainTheme() {
	return {
		fg: (_color: string, text: string) => text,
		bg: (_color: string, text: string) => text,
		bold: (text: string) => text,
	};
}

function renderToString(component: { render: (width: number) => string[] }): string {
	return component.render(160).join("\n").trimEnd();
}

function registeredDelegateTool(): any {
	let delegateTool: any;
	teammatesExtension({
		on() {},
		registerCommand() {},
		registerTool(tool: any) {
			if (tool.name === "delegate") delegateTool = tool;
		},
		getActiveTools() {
			return [];
		},
	} as any);
	assert.ok(delegateTool, "delegate tool should be registered");
	return delegateTool;
}

const zeroUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 };
const reviewerUsage = { input: 12_000, output: 4_000, cacheRead: 0, cacheWrite: 0, cost: 0.1725, contextTokens: 16_000, turns: 6 };
const researcherUsage = { input: 30_000, output: 9_000, cacheRead: 10_000, cacheWrite: 0, cost: 0.0281, contextTokens: 49_000, turns: 17 };
const explorerUsage = { input: 40_000, output: 20_000, cacheRead: 9_000, cacheWrite: 0, cost: 0.0143, contextTokens: 69_000, turns: 22 };

function assistantToolCall(name: string, args: Record<string, unknown>) {
	return {
		role: "assistant",
		content: [{ type: "toolCall", name, arguments: args }],
	};
}

function assistantText(text: string) {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
	};
}

function result(overrides: Record<string, unknown>) {
	return {
		teammate: "Reviewer",
		teammateSource: "builtin",
		task: "Review only Task 7 work for spec compliance against docs/plans/task-7.md",
		exitCode: 0,
		messages: [],
		stderr: "",
		usage: zeroUsage,
		...overrides,
	};
}

function renderResult(details: any, content = "delegate output", context?: any) {
	return renderToString(delegateTool.renderResult(
		{
			content: [{ type: "text", text: content }],
			details,
		} as any,
		{ expanded: false },
		plainTheme(),
		context,
	));
}

const delegateTool = registeredDelegateTool();

{
	const call = renderToString(delegateTool.renderCall(
		{
			context: "new",
			tasks: [
				{ teammate: "Researcher", task: "Analyze the referenced repo https://example.test/repo" },
				{ teammate: "Explorer", task: "Inspect Pi local docs/code for feature insertion points" },
			],
		},
		plainTheme(),
	));

	assert.equal(call, "Delegate(2 tasks) [new]");
	assert.doesNotMatch(call, /Analyze the referenced repo/);
	assert.doesNotMatch(call, /Researcher/);
}

{
	const rendered = renderResult({
		mode: "single",
		projectTeammatesDir: null,
		collapsedItemCount: 10,
		results: [result({
			status: "running",
			exitCode: 0,
			model: "anthropic/claude-opus-4-8:high",
			usage: reviewerUsage,
			messages: [
				assistantToolCall("read", { path: "/home/arnold/.pi/agent/custom-extensions/pi-agent-skills/src/types.ts", offset: 54, limit: 45 }),
				assistantToolCall("read", { path: "/home/arnold/.pi/agent/custom-extensions/pi-agent-skills/docs/specs/2026-06-09-pi-agent-skills-design.md", offset: 260, limit: 70 }),
				assistantToolCall("grep", { pattern: "SkillsBranchState", path: "src" }),
				assistantToolCall("bash", { command: "cd /home/arnold/.pi/agent/custom-extensions/pi-agent-skills && npm test" }),
			],
		})],
	});

	assert.match(rendered, /^⎿ Reviewer  · 6 turns · 16k tokens · \$0\.1725 · anthropic\/claude-opus-4-8:high/m);
	assert.match(rendered, /├  Goal: Review only Task 7 work/);
	assert.match(rendered, /├  … \+1 tool uses/);
	assert.match(rendered, /Read\(~\/\.pi\/agent\/custom-extensions\/pi-agent-skills\/docs\/specs\/2026-06-09-pi-agent-skills-design\.md:260-329\)/);
	assert.match(rendered, /└  Bash\(cd \/home\/arnold\/\.pi\/agent\/custom-extensions\/pi-agent-skills …\)/);
	assert.match(rendered, /Running…/);
	assert.match(rendered, /\(Ctrl\+O to expand\)/);
	assert.doesNotMatch(rendered, /^✓ Reviewer/m);
}

{
	const rendered = renderResult({
		mode: "single",
		projectTeammatesDir: null,
		collapsedItemCount: 10,
		results: [result({
			status: "completed",
			exitCode: 0,
			model: "anthropic/claude-opus-4-8:high",
			usage: reviewerUsage,
			messages: [assistantText("## Verdict\n\n**APPROVE** — Task 7 implements the plan verbatim.")],
		})],
	}, "Reviewer finished");

	assert.match(rendered, /^⎿ Reviewer  · 6 turns · 16k tokens · \$0\.1725 · anthropic\/claude-opus-4-8:high/m);
	assert.match(rendered, /├  Goal: Review only Task 7 work/);
	assert.match(rendered, /⎿  Done ✓/);
	assert.match(rendered, /\(Ctrl\+O to expand\)/);
	assert.doesNotMatch(rendered, /## Verdict/);
	assert.doesNotMatch(rendered, /APPROVE/);
}

{
	const rendered = renderResult({
		mode: "single",
		projectTeammatesDir: null,
		collapsedItemCount: 10,
		results: [result({
			task: "Goal: Research Handlebars features and constraints",
			status: "completed",
			exitCode: 0,
		})],
	});

	assert.match(rendered, /Goal: Research Handlebars features and constraints/);
	assert.doesNotMatch(rendered, /Goal: Goal:/);
}

{
	const rendered = renderResult({
		mode: "parallel",
		projectTeammatesDir: null,
		collapsedItemCount: 10,
		results: [
			result({
				teammate: "Researcher",
				task: "Analyze the referenced repo https://example.test/repo",
				status: "running",
				exitCode: 0,
				model: "deepseek/deepseek-v4-pro:high",
				usage: { ...researcherUsage, turns: 5, contextTokens: 10_000, cost: 0.0281 },
				messages: [assistantToolCall("read", { path: "/home/arnold/.cache/pi-searxng/git/github.com/Piebald-AI/claude-code-system-prompts/" })],
			}),
			result({
				teammate: "Explorer",
				task: "Inspect Pi local docs/code for feature insertion points",
				status: "running",
				exitCode: 0,
				model: "deepseek/deepseek-v4-flash:high",
				usage: explorerUsage,
				messages: [assistantToolCall("read", { path: "/home/arnold/.asdf/installs/nodejs/24.14.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/skills.d.ts" })],
			}),
		],
	});

	assert.match(rendered, /^⎿ parallel 0\/2 done · 2 running/m);
	assert.match(rendered, /├ Researcher  · 5 turns · 10k tokens · \$0\.0281 · deepseek\/deepseek-v4-pro:high/);
	assert.match(rendered, /│ ├  Goal: Analyze the referenced repo/);
	assert.match(rendered, /│ └  Read\(~\/\.cache\/pi-searxng\/git\/github.com\/Piebald-AI\/claude-code-system-prompts\/\)/);
	assert.match(rendered, /└ Explorer  · 22 turns · 69k tokens · \$0\.0143 · deepseek\/deepseek-v4-flash:high/);
	assert.match(rendered, /Running…/);
	assert.doesNotMatch(rendered, /teammates finished/);
	assert.doesNotMatch(rendered, /Done ✓/);
}

{
	const rendered = renderResult({
		mode: "parallel",
		projectTeammatesDir: null,
		collapsedItemCount: 10,
		results: [
			result({
				teammate: "Researcher",
				task: "Analyze the referenced repo https://example.test/repo",
				status: "completed",
				exitCode: 0,
				model: "deepseek/deepseek-v4-pro:high",
				usage: researcherUsage,
			}),
			result({
				teammate: "Explorer",
				task: "Inspect Pi local docs/code for feature insertion points",
				status: "completed",
				exitCode: 0,
				model: "deepseek/deepseek-v4-flash:high",
				usage: explorerUsage,
			}),
		],
	});

	assert.match(rendered, /^⎿ parallel 2\/2 teammates finished ✓/m);
	assert.match(rendered, /├ Researcher  · 17 turns · 49k tokens · \$0\.0281 · deepseek\/deepseek-v4-pro:high/);
	assert.match(rendered, /│ ├  Goal: Analyze the referenced repo/);
	assert.match(rendered, /│ ⎿  Done ✓/);
	assert.match(rendered, /└ Explorer  · 22 turns · 69k tokens · \$0\.0143 · deepseek\/deepseek-v4-flash:high/);
	assert.match(rendered, /  ⎿  Done ✓/);
	assert.match(rendered, /Total: 39 turns · 118k tokens · \$0\.0424/);
}

{
	const chainArgs = {
		chain: [
			{ teammate: "Explorer", task: "Inspect the current rendering implementation" },
			{ teammate: "Worker", task: "Implement the renderer changes using previous findings" },
			{ teammate: "Reviewer", task: "Review the implementation after Worker completes" },
		],
	};
	const rendered = renderResult({
		mode: "chain",
		projectTeammatesDir: null,
		collapsedItemCount: 10,
		results: [
			result({
				teammate: "Explorer",
				task: "Inspect the current rendering implementation",
				status: "completed",
				exitCode: 0,
				model: "deepseek/deepseek-v4-flash:high",
				usage: { input: 10_000, output: 8_000, cacheRead: 3_000, cacheWrite: 0, cost: 0.0041, contextTokens: 21_000, turns: 8 },
				step: 1,
			}),
			result({
				teammate: "Worker",
				task: "Implement the renderer changes using previous findings",
				status: "running",
				exitCode: 0,
				model: "deepseek/deepseek-v4-pro:high",
				usage: { input: 4_000, output: 3_000, cacheRead: 2_000, cacheWrite: 0, cost: 0.0063, contextTokens: 9_000, turns: 3 },
				messages: [assistantToolCall("edit", { path: "src/index.ts" })],
				step: 2,
			}),
		],
	}, "delegate output", { args: chainArgs });

	assert.match(rendered, /^⎿ chain 1\/3 steps done · step 2 running/m);
	assert.match(rendered, /├ Step 1: Explorer  · 8 turns · 21k tokens · \$0\.0041 · deepseek\/deepseek-v4-flash:high/);
	assert.match(rendered, /│ ├  Goal: Inspect the current rendering implementation/);
	assert.match(rendered, /│ ⎿  Done ✓/);
	assert.match(rendered, /├ Step 2: Worker  · 3 turns · 9\.0k tokens · \$0\.0063 · deepseek\/deepseek-v4-pro:high/);
	assert.match(rendered, /│ ├  Goal: Implement the renderer changes using previous findings/);
	assert.match(rendered, /│ └  Edit\(src\/index\.ts\)/);
	assert.match(rendered, /Running…/);
	assert.match(rendered, /└ Step 3: Reviewer/);
	assert.match(rendered, /Goal: Review the implementation after Worker completes/);
	assert.match(rendered, /Waiting…/);
	assert.doesNotMatch(rendered, /Total:/);
}

console.log("delegate rendering tests passed");
