import assert from "node:assert/strict";
import {
	buildTeamPromptBlock,
	canDelegateToTeammate,
	resolveTeammateToolNames,
} from "../src/delegation-policy.ts";

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

const prompt = buildTeamPromptBlock([
	{
		name: 'scout & recon',
		description: 'Reads <files> & reports only what matters.',
		source: 'user',
		filePath: '/tmp/scout.md',
		systemPrompt: 'ignored',
		promptMode: 'append',
	},
	{
		name: 'reviewer',
		description: 'Performs verification and code review.',
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
		'Use delegation only for bounded execution tasks where specialization, isolation, or parallelism clearly helps.',
		'Do not delegate when you can complete the work directly from the current context without losing quality.',
		'Delegate execution, not judgment. Decide the real task yourself before calling `delegate`.',
		'Every delegated task should include the concrete goal, relevant files or symbols when known, important constraints or risks, and the expected output.',
		'Do not send vague prompts like "look into this", "handle it", or "fix the bug" without the actual scoped brief.',
		'Choose context deliberately: `new` for self-contained tasks, `summary` for fresh workers that need broader background, `handoff` for one specific next-step execution brief, and `inherit` only when transcript continuity is truly required.',
		'After a teammate returns, integrate the result yourself or issue a tighter follow-up; do not assume the child owns the conversation.',
		'</delegation_policy>',
		'<team>',
		'<member name="scout &amp; recon">Reads &lt;files&gt; &amp; reports only what matters.</member>',
		'<member name="reviewer">Performs verification and code review.</member>',
		'</team>',
	].join('\n'),
);

console.log("delegation policy tests passed");
