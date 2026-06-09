import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { ejectBuiltinTeammates, type BuiltinEjectScope } from "../builtin-teammates.ts";

export async function runEjectBuiltinCommand(commandArgs: string, ctx: ExtensionCommandContext): Promise<void> {
	const tokens = commandArgs.split(/\s+/).map((token) => token.trim()).filter(Boolean);
	const overwrite = tokens.includes("--overwrite");
	const explicitScope = tokens.find((token): token is BuiltinEjectScope => token === "project" || token === "user");
	const selectedScope = explicitScope ?? await ctx.ui.select("Eject builtin teammates to which scope?", ["project", "user"]);
	if (selectedScope !== "project" && selectedScope !== "user") return;
	const result = await ejectBuiltinTeammates({ cwd: ctx.cwd, scope: selectedScope, overwrite });
	const skippedNote = result.skipped.length > 0 ? `, skipped ${result.skipped.length} existing file(s)` : "";
	ctx.ui.notify(`Ejected ${result.created.length} builtin teammate(s) to ${result.targetDir}${skippedNote}`, "info");
}
