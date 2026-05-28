import assert from "node:assert/strict";
import {
	buildManualDelegationTranscript,
	buildTeammateTemplate,
	defaultNewSessionTask,
	parseTeamCommandArgs,
} from "../src/command-helpers.ts";

assert.deepEqual(parseTeamCommandArgs("--agent scout --improve inspect auth flow"), {
	agent: "scout",
	improve: true,
	task: "inspect auth flow",
});

assert.deepEqual(parseTeamCommandArgs("--improve --agent reviewer \"check edge cases\""), {
	agent: "reviewer",
	improve: true,
	task: "check edge cases",
});

assert.deepEqual(parseTeamCommandArgs("find all auth providers"), {
	agent: undefined,
	improve: false,
	task: "find all auth providers",
});

assert.equal(defaultNewSessionTask("summary", ""), "Continue the work from this summary in the new session.");
assert.equal(defaultNewSessionTask("handoff", ""), "Continue the next task from this handoff in the new session.");
assert.equal(defaultNewSessionTask("handoff", "Ship phase one"), "Ship phase one");

const template = buildTeammateTemplate({ name: "scout", description: "Fast recon" });
assert.match(template, /^---/);
assert.match(template, /name: scout/);
assert.match(template, /description: Fast recon/);
assert.match(template, /skills: \[\]/);
assert.match(template, /context: new/);
assert.match(template, /delegate: false/);

const transcript = buildManualDelegationTranscript({
	commandName: "team:delegate",
	teammateName: "scout",
	contextMode: "summary",
	task: "Inspect src/index.ts",
	sessionId: "child-123",
	resultText: "Found the auth flow",
	status: "completed",
});
assert.match(transcript, /manual_teammate_invocation/);
assert.match(transcript, /child-123/);
assert.match(transcript, /Found the auth flow/);

console.log("command helper tests passed");
