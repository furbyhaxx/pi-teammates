import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { completeTeamDelegateArguments } from "../commands/completions.ts";
import { runEjectBuiltinCommand } from "../commands/eject.ts";
import { runManualTeammateDelegation } from "../commands/manual-delegate.ts";
import { runNewSessionTransfer } from "../commands/session-transfer.ts";
import { runStatusCommand } from "../commands/status.ts";
import { runTeammateManager } from "../ui/manage/index.ts";

export function registerCommands(pi: ExtensionAPI): void {
	pi.registerCommand("team:delegate", {
		description: "Manually delegate a scoped task to a teammate while staying in the current session",
		getArgumentCompletions: completeTeamDelegateArguments,
		handler: async (commandArgs, ctx) => {
			await runManualTeammateDelegation({
				pi,
				ctx,
				commandName: "team:delegate",
				rawArgs: commandArgs,
			});
		},
	});

	pi.registerCommand("team:handoff", {
		description: "Manually offload a scoped task to a teammate using handoff context while staying in the current session",
		handler: async (commandArgs, ctx) => {
			await runManualTeammateDelegation({
				pi,
				ctx,
				commandName: "team:handoff",
				forcedContext: "handoff",
				rawArgs: commandArgs,
			});
		},
	});

	pi.registerCommand("summarize", {
		description: "Create a new normal Pi session from a generated summary of the current one",
		handler: async (commandArgs, ctx) => {
			await runNewSessionTransfer({ ctx, mode: "summary", rawArgs: commandArgs });
		},
	});

	pi.registerCommand("handoff", {
		description: "Create a new normal Pi session from a generated handoff packet of the current one",
		handler: async (commandArgs, ctx) => {
			await runNewSessionTransfer({ ctx, mode: "handoff", rawArgs: commandArgs });
		},
	});

	pi.registerCommand("team:status", {
		description: "Show a live overlay of teammate activity for the current session",
		handler: async (_args, ctx) => {
			await runStatusCommand({ pi, ctx });
		},
	});

	pi.registerCommand("team:eject", {
		description: "Copy builtin teammate templates into project or user scope as editable teammate files",
		handler: async (commandArgs, ctx) => {
			await runEjectBuiltinCommand(commandArgs, ctx);
		},
	});

	pi.registerCommand("team:manage", {
		description: "Open an interactive teammate manager for creating, editing, duplicating, and deleting teammate files",
		handler: async (_args, ctx) => {
			await runTeammateManager(ctx);
		},
	});
}
