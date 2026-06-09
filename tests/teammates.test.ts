import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	discoverTeammates,
	parseTeammateMarkdown,
} from "../src/teammates.ts";

const parsed = parseTeammateMarkdown(
	join("/tmp", "ScoutAgent.md"),
	"user",
	`---
name: ScoutAgent
description: Fast recon teammate
tools:
  read: true
  grep: true
  write: false
  delegate: true
skills:
  - systematic-debugging
  - test-driven-development
model: deepseek/deepseek-v4-flash:high
context: handoff
prompt: replace
---
Inspect the codebase and report only the relevant findings.\n`,
);

assert.deepEqual(parsed, {
	name: "ScoutAgent",
	description: "Fast recon teammate",
	tools: {
		read: true,
		grep: true,
		write: false,
		delegate: true,
	},
	skills: ["systematic-debugging", "test-driven-development"],
	model: "deepseek/deepseek-v4-flash:high",
	contextMode: "handoff",
	promptMode: "replace",
	systemPrompt: "Inspect the codebase and report only the relevant findings.",
	source: "user",
	filePath: join("/tmp", "ScoutAgent.md"),
});

assert.throws(
	() =>
		parseTeammateMarkdown(
			join("/tmp", "Bad.md"),
			"user",
			`---
name: ../Bad
description: nope
---
prompt\n`,
		),
	/teammate names must use letters, numbers, and hyphens only/,
);

const root = mkdtempSync(join(tmpdir(), "pi-teammates-discovery-"));
const agentDir = join(root, "agent");
const projectRoot = join(root, "workspace");
const nestedCwd = join(projectRoot, "packages", "feature");
mkdirSync(join(agentDir, "teammates", "research"), { recursive: true });
mkdirSync(join(projectRoot, ".pi", "teammates", "review"), { recursive: true });
mkdirSync(nestedCwd, { recursive: true });

writeFileSync(
	join(agentDir, "teammates", "research", "scout.md"),
	`---
name: scout
description: User scout
---
User scout prompt\n`,
);
writeFileSync(
	join(agentDir, "teammates", "worker.md"),
	`---
name: worker
description: User worker
---
Worker prompt\n`,
);
writeFileSync(
	join(projectRoot, ".pi", "teammates", "review", "scout.md"),
	`---
name: scout
description: Project scout override
---
Project scout prompt\n`,
);
writeFileSync(
	join(projectRoot, ".pi", "teammates", "reviewer.md"),
	`---
name: reviewer
description: Project reviewer
prompt: invalid
---
Reviewer prompt\n`,
);

const discovery = discoverTeammates(nestedCwd, {
	agentDir,
	loadProjectTeammates: true,
});
assert.equal(discovery.projectTeammatesDir, join(projectRoot, ".pi", "teammates"));
assert.equal(discovery.usingBuiltins, false);
assert.deepEqual(
	discovery.teammates.map((teammate) => ({
		name: teammate.name,
		description: teammate.description,
		source: teammate.source,
		promptMode: teammate.promptMode,
	})),
	[
		{
			name: "reviewer",
			description: "Project reviewer",
			source: "project",
			promptMode: "append",
		},
		{
			name: "scout",
			description: "Project scout override",
			source: "project",
			promptMode: "append",
		},
		{
			name: "worker",
			description: "User worker",
			source: "user",
			promptMode: "append",
		},
	],
);

const noProject = discoverTeammates(nestedCwd, {
	agentDir,
	loadProjectTeammates: false,
});
assert.equal(noProject.usingBuiltins, false);
assert.deepEqual(
	noProject.teammates.map((teammate) => teammate.name),
	["scout", "worker"],
);

const emptyRoot = mkdtempSync(join(tmpdir(), "pi-teammates-empty-"));
const emptyAgentDir = join(emptyRoot, "agent");
const emptyProject = join(emptyRoot, "workspace");
mkdirSync(join(emptyAgentDir, "teammates"), { recursive: true });
mkdirSync(emptyProject, { recursive: true });
const builtinDiscovery = discoverTeammates(emptyProject, {
	agentDir: emptyAgentDir,
	loadProjectTeammates: true,
});
assert.equal(builtinDiscovery.usingBuiltins, true);
assert.deepEqual(
	builtinDiscovery.teammates.map((teammate) => ({ name: teammate.name, source: teammate.source })),
	[
		{ name: "Documenter", source: "builtin" },
		{ name: "Explorer", source: "builtin" },
		{ name: "IssueAnalyst", source: "builtin" },
		{ name: "Researcher", source: "builtin" },
		{ name: "Reviewer", source: "builtin" },
		{ name: "Worker", source: "builtin" },
	],
);

console.log("teammate discovery tests passed");
