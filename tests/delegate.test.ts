import assert from "node:assert/strict";
import {
	buildTeamPromptBlock,
	canDelegateToTeammate,
	resolveTeammateToolNames,
} from "../src/delegation-policy.ts";
import { formatResolvedModelLabel } from "../src/index.ts";

assert.deepEqual(
	resolveTeammateToolNames({
		activeTools: ["read", "grep", "shell_exec", "shell_write_stdin", "delegate"],
		toolToggles: {
			read: true,
			bash: true,
			shell_write_stdin: false,
		},
		toolAliases: {
			bash: ["shell_exec", "shell_write_stdin"],
		},
		delegateEnabled: false,
	}),
	["read", "shell_exec"],
);

assert.deepEqual(
	resolveTeammateToolNames({
		activeTools: ["read", "grep", "delegate"],
		toolToggles: {
			delegate: false,
		},
		toolAliases: {},
		delegateEnabled: false,
	}),
	["read", "grep"],
);

assert.deepEqual(
	resolveTeammateToolNames({
		activeTools: ["read", "grep", "delegate"],
		toolToggles: {
			read: true,
			delegate: true,
		},
		toolAliases: {},
		delegateEnabled: true,
	}),
	["read", "delegate"],
);

assert.equal(
	canDelegateToTeammate({
		targetName: "reviewer",
		lineage: ["worker", "planner"],
	}),
	true,
);
assert.equal(
	canDelegateToTeammate({
		targetName: "worker",
		lineage: ["worker", "planner"],
	}),
	false,
);

assert.equal(
	formatResolvedModelLabel({ provider: "deepseek", id: "deepseek-v4-flash" }, "xhigh"),
	"deepseek/deepseek-v4-flash:xhigh",
);
assert.equal(
	formatResolvedModelLabel({ provider: "openai-codex", id: "gpt-5.5" }, "off"),
	"openai-codex/gpt-5.5:off",
);
assert.equal(formatResolvedModelLabel(undefined, "high"), undefined);

const prompt = buildTeamPromptBlock([
	{
		name: 'scout & recon',
		description: 'Reads <files> & reports only what matters.',
		contextMode: 'new',
		source: 'user',
		filePath: '/tmp/scout.md',
		systemPrompt: 'ignored',
		promptMode: 'append',
	},
	{
		name: 'reviewer',
		description: 'Performs verification and code review.',
		contextMode: 'handoff',
		source: 'project',
		filePath: '/tmp/reviewer.md',
		systemPrompt: 'ignored',
		promptMode: 'append',
	},
]);

assert.equal(
	prompt,
	[
		'<delegation_policy>',
		'Decompose work before calling delegate: identify all independent workstreams and sequential dependencies, then batch them into one call — N independent tasks into one `tasks` call (parallel), a sequential pipeline into one `chain` call.',
		'Never make multiple sequential delegate calls for independent subtasks. Use `tasks` to run them in parallel — parallel costs zero extra wall-clock time and is the default mode for independent work.',
		'If you are about to emit more than one delegate call for subtasks that do not depend on each other, collapse them into a single `tasks` call instead — multiple delegate calls in one turn for independent work is the same mistake as making them sequentially.',
		'Use delegation only for bounded execution tasks where specialization, isolation, or parallelism clearly helps.',
		'Do not delegate when you can complete the work directly from the current context without losing quality.',
		'Delegate execution, not judgment. Decide the real task yourself before calling `delegate`.',
		'Every delegated task should include the concrete goal, relevant files or symbols when known, important constraints or risks, and the expected output.',
		'Do not send vague prompts like "look into this", "handle it", or "fix the bug" without the actual scoped brief.',
		'Choose context deliberately: `new` for self-contained tasks, `summary` for fresh workers that need broader background, `handoff` for one specific next-step execution brief, and `inherit` only when transcript continuity is truly required.',
		'The `context` attribute on each team member shows their configured default context mode — prefer it unless you have a specific reason to override.',
		'After a teammate returns, integrate the result yourself or issue a tighter follow-up; do not assume the child owns the conversation.',
		'</delegation_policy>',
		'<team>',
		'<member name="scout &amp; recon" context="new">Reads &lt;files&gt; &amp; reports only what matters.</member>',
		'<member name="reviewer" context="handoff">Performs verification and code review.</member>',
		'</team>',
	].join('\n'),
);

console.log("delegation policy tests passed");
