import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	DEFAULT_TEAMMATES_CONFIG,
	loadTeammatesConfig,
} from "../src/config.ts";

assert.deepEqual(DEFAULT_TEAMMATES_CONFIG, {
	teammates: {
		loadProjectTeammates: true,
		maxParallelTasks: 8,
		maxConcurrency: 4,
		collapsedItemCount: 10,
		perTaskOutputCap: 50 * 1024,
		toolAliases: {},
	},
});

const root = mkdtempSync(join(tmpdir(), "pi-teammates-config-"));
const agentDir = join(root, "agent");
const cwd = join(root, "project");
mkdirSync(join(agentDir), { recursive: true });
mkdirSync(join(cwd, ".pi"), { recursive: true });

const globalSettingsPath = join(agentDir, "settings.json");
writeFileSync(
	globalSettingsPath,
	JSON.stringify(
		{
			teammates: {
				load_project_teammates: false,
				max_parallel_tasks: 12,
				tool_aliases: {
					bash: ["shell_exec"],
				},
			},
		},
		null,
		2,
	),
);

const projectSettingsPath = join(cwd, ".pi", "settings.json");
writeFileSync(
	projectSettingsPath,
	JSON.stringify(
		{
			teammates: {
				maxConcurrency: 2,
				collapsedItemCount: 7,
				toolAliases: {
					bash: ["shell_exec", "shell_write_stdin"],
					scout: ["read"],
				},
			},
		},
		null,
		2,
	),
);

const loaded = loadTeammatesConfig(cwd, agentDir);
assert.deepEqual(loaded.config, {
	teammates: {
		loadProjectTeammates: false,
		maxParallelTasks: 12,
		maxConcurrency: 2,
		collapsedItemCount: 7,
		perTaskOutputCap: 50 * 1024,
		toolAliases: {
			bash: ["shell_exec", "shell_write_stdin"],
			scout: ["read"],
		},
	},
});
assert.deepEqual(loaded.sources, [globalSettingsPath, projectSettingsPath]);

console.log("config tests passed");
