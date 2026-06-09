import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadTeammatesConfig } from "../config.ts";
import {
	buildTeamPromptBlock,
	canDelegateToTeammate,
} from "../delegation-policy.ts";
import { parseTeammatesLineage, TEAMMATES_LINEAGE_ENV } from "../delegate-process.ts";
import {
	collectInterruptedTeammateJobs,
	TEAMMATE_JOB_CUSTOM_TYPE,
	updateTeammateJobRecord,
} from "../job-registry.ts";
import { getLatestTeammateSessionState } from "../teammate-state.ts";
import { discoverTeammates } from "../teammates.ts";

export function registerEvents(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		for (const job of collectInterruptedTeammateJobs(ctx.sessionManager.getEntries())) {
			pi.appendEntry(TEAMMATE_JOB_CUSTOM_TYPE, updateTeammateJobRecord(job, "interrupted"));
		}
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const selectedTools = event.systemPromptOptions.selectedTools ?? [];
		if (!selectedTools.includes("delegate")) return;

		const runtimeConfig = loadTeammatesConfig(ctx.cwd).config.teammates;
		const lineage = getLatestTeammateSessionState(ctx.sessionManager.getEntries())?.lineage ?? parseTeammatesLineage(process.env[TEAMMATES_LINEAGE_ENV]);
		const discovery = discoverTeammates(ctx.cwd, {
			loadProjectTeammates: runtimeConfig.loadProjectTeammates,
		});
		const availableTeammates = discovery.teammates.filter((teammate) =>
			canDelegateToTeammate({ targetName: teammate.name, lineage }),
		);
		if (availableTeammates.length === 0) return;

		return {
			systemPrompt: `${event.systemPrompt}\n\n${buildTeamPromptBlock(availableTeammates)}`,
		};
	});
}
