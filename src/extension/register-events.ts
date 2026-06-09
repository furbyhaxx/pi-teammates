import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadTeammatesConfig } from "../config/load.ts";
import {
	buildTeamPromptBlock,
	canDelegateToTeammate,
} from "../teammates/policy.ts";
import { parseTeammatesLineage, TEAMMATES_LINEAGE_ENV } from "../teammates/process.ts";
import { collectInterruptedTeammateJobs } from "../jobs/queries.ts";
import { updateTeammateJobRecord } from "../jobs/records.ts";
import { TEAMMATE_JOB_CUSTOM_TYPE } from "../jobs/types.ts";
import { getLatestTeammateSessionState } from "../teammates/state.ts";
import { discoverTeammates } from "../teammates/discover.ts";

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
