import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defaultNewSessionTask } from "../command-helpers.ts";
import { loadTeammatesConfig } from "../config.ts";
import {
	buildDelegatedUserTask,
	generateDelegationContext,
} from "../context-transfer.ts";

export async function runNewSessionTransfer(args: {
	ctx: Parameters<NonNullable<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>>[1];
	mode: "summary" | "handoff";
	rawArgs: string;
}): Promise<void> {
	const task = defaultNewSessionTask(args.mode, args.rawArgs.trim());
	const runtimeConfig = loadTeammatesConfig(args.ctx.cwd).config.teammates;
	const packet = await generateDelegationContext({
		mode: args.mode,
		task,
		branch: args.ctx.sessionManager.getBranch(),
		contextConfig: runtimeConfig.context,
		currentModel: args.ctx.model,
		modelRegistry: args.ctx.modelRegistry,
		signal: args.ctx.signal,
	});
	const prompt = buildDelegatedUserTask({ mode: args.mode, task, generatedContext: packet });
	const edited = await args.ctx.ui.editor(`Review ${args.mode} session prompt`, prompt);
	if (!edited?.trim()) return;

	await args.ctx.newSession({
		parentSession: args.ctx.sessionManager.getSessionFile(),
		withSession: async (replacementCtx) => {
			replacementCtx.ui.setEditorText(edited.trim());
			replacementCtx.ui.notify(`${args.mode} prompt ready in the new session.`, "info");
		},
	});
}
