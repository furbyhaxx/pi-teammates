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
		delegate: false,
	},
	{
		name: 'reviewer',
		description: 'Performs verification and code review.',
		source: 'project',
		filePath: '/tmp/reviewer.md',
		systemPrompt: 'ignored',
		promptMode: 'append',
		delegate: true,
	},
]);

assert.equal(
	prompt,
	[
		'Below is a list of your teammates with their specializations, capabilities and domains. Use this information to delegate narrow, concrete work that benefits from a fresh context window or teammate-specific tools, prompts, or model settings. Delegate execution, not judgment: decide what needs to be done, pass the relevant files and constraints, and ask for the exact output you want back.',
		'<team>',
		'<member name="scout &amp; recon">Reads &lt;files&gt; &amp; reports only what matters.</member>',
		'<member name="reviewer">Performs verification and code review.</member>',
		'</team>',
	].join('\n'),
);

console.log("delegation policy tests passed");
