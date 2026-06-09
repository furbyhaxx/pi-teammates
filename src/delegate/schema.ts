import { StringEnum } from "@earendil-works/pi-ai";
import { type Static, Type } from "typebox";
import { TEAMMATE_CONTEXT_MODES } from "../context/modes.ts";

export const TaskItem = Type.Object({
	teammate: Type.String({ description: "Name of the teammate to invoke" }),
	task: Type.String({ description: "Task to delegate to the teammate" }),
	cwd: Type.Optional(Type.String({ description: "Working directory for the teammate process" })),
});

export const ChainItem = Type.Object({
	teammate: Type.String({ description: "Name of the teammate to invoke" }),
	task: Type.String({ description: "Task with optional {previous} placeholder for prior output" }),
	cwd: Type.Optional(Type.String({ description: "Working directory for the teammate process" })),
});

export const ContextModeSchema = StringEnum(TEAMMATE_CONTEXT_MODES, {
	description:
		"Context strategy override for this delegate call. new = task only (default, use for self-contained tasks). summary = fresh session plus a generated task-focused context summary (use when the teammate needs session background). handoff = fresh session plus a generated execution-oriented handoff packet (use for one specific next-step task). inherit = exact caller session clone (use only when transcript continuity is truly required). Omit to use the teammate's configured default, which is shown in the <team> block.",
});

export const DelegateParamsSchema = Type.Object({
	resumeSessionId: Type.Optional(Type.String({ description: "Resume a previously started teammate session by its returned session id." })),
	teammate: Type.Optional(Type.String({ description: "Name of the teammate to invoke (single mode)" })),
	task: Type.Optional(Type.String({ description: "Task to delegate (single mode)" })),
	tasks: Type.Optional(Type.Array(TaskItem, { description: "Parallel teammate tasks" })),
	chain: Type.Optional(Type.Array(ChainItem, { description: "Sequential teammate chain" })),
	context: Type.Optional(ContextModeSchema),
	cwd: Type.Optional(Type.String({ description: "Working directory for the teammate process (single mode)" })),
});

export type DelegateParams = Static<typeof DelegateParamsSchema>;
