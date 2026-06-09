import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	ejectBuiltinTeammates,
	getBuiltinTeammates,
} from "../src/builtin-teammates.ts";

const builtins = getBuiltinTeammates();
assert.deepEqual(
	builtins.map((teammate) => teammate.name),
	["Documenter", "Explorer", "IssueAnalyst", "Researcher", "Reviewer", "Worker"],
);
assert.ok(builtins.every((teammate) => teammate.content.includes(`name: ${teammate.name}`)));

const root = mkdtempSync(join(tmpdir(), "pi-teammates-eject-"));
const cwd = join(root, "project");
const agentDir = join(root, "agent");

const projectResult = await ejectBuiltinTeammates({ cwd, agentDir, scope: "project" });
assert.equal(projectResult.created.length, 6);
assert.equal(projectResult.skipped.length, 0);
assert.equal(projectResult.targetDir, join(cwd, ".pi", "teammates"));
assert.ok(existsSync(join(cwd, ".pi", "teammates", "Documenter.md")));
assert.match(readFileSync(join(cwd, ".pi", "teammates", "IssueAnalyst.md"), "utf-8"), /name: IssueAnalyst/);

const projectAgain = await ejectBuiltinTeammates({ cwd, agentDir, scope: "project" });
assert.equal(projectAgain.created.length, 0);
assert.equal(projectAgain.skipped.length, 6);

const userResult = await ejectBuiltinTeammates({ cwd, agentDir, scope: "user" });
assert.equal(userResult.created.length, 6);
assert.equal(userResult.targetDir, join(agentDir, "teammates"));
assert.ok(existsSync(join(agentDir, "teammates", "Worker.md")));

console.log("builtin teammate tests passed");
