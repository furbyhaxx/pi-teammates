import { loadTeammatesConfig } from "../config.ts";
import { discoverTeammates } from "../teammates.ts";

export async function completeTeamDelegateArguments(prefix: string) {
	const match = prefix.match(/(?:^|\s)--agent\s+(\S*)$/);
	if (!match) return null;
	const discovery = discoverTeammates(process.cwd(), {
		loadProjectTeammates: loadTeammatesConfig(process.cwd()).config.teammates.loadProjectTeammates,
	});
	return discovery.teammates
		.filter((teammate) => teammate.name.startsWith(match[1] ?? ""))
		.map((teammate) => ({ value: teammate.name, label: teammate.name }));
}
