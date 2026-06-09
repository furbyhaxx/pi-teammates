import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { executeDelegateTool } from "./execute.ts";
import { renderDelegateCall } from "./render/render-call.ts";
import { renderDelegateResult } from "./render/render-result.ts";
import { DelegateParamsSchema } from "./schema.ts";

export function registerDelegateTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "delegate",
		label: "Delegate",
		description: [
			"Delegate bounded execution work to configured teammates in isolated Pi sessions.",
			"Use `tasks` (parallel array) whenever you have two or more independent subtasks — parallel runs all tasks concurrently at zero additional wall-clock cost and is the correct default for independent work.",
			"Use `chain` for sequential pipelines where each step uses `{previous}` output from the prior step.",
			"Use single (`teammate`+`task`) only for a single isolated subtask.",
			"Use it when specialization, a fresh context window, or parallelism will materially improve the result; do not use for vague requests or work you can complete inline without quality loss.",
			"`context` controls how much caller state each child receives: `new` = task only, `summary` = fresh session plus generated task-focused context summary, `handoff` = fresh session plus execution-oriented handoff packet, `inherit` = exact caller session clone.",
			"If `context` is omitted the teammate's configured default is used (`new` unless overridden in the teammate file).",
			"`resumeSessionId` resumes an interrupted teammate run; do not combine with new task parameters.",
			"Streams progress while running and returns each teammate's final output with session IDs for status and resume flows.",
		].join(" "),
		promptSnippet: "Delegate bounded execution work to configured teammates in isolated internal Pi sessions.",
		promptGuidelines: [
			"Decompose work before calling delegate: identify all independent workstreams and sequential dependencies, then batch them into one call — N independent tasks into one `tasks` call (parallel), a sequential pipeline into one `chain` call.",
			"Never make multiple sequential delegate calls for independent subtasks — use `tasks` instead. Sequential delegation wastes wall-clock time and is the most common misuse of this tool.",
			"If you are about to emit more than one delegate call for subtasks that do not depend on each other, collapse them into a single `tasks` call — multiple delegate calls in one turn for independent work is the same mistake as making them sequentially.",
			"Use `delegate` only after you have decided the actual subtask; delegate execution, not judgment — decide the real work yourself first.",
			"In every delegated task, include the concrete goal, relevant files or symbols, key constraints or risks, and the expected output format.",
			"Prefer `context=new` for self-contained tasks; use `context=summary` when the teammate needs broader session background; use `context=handoff` for one specific next-step execution brief; use `context=inherit` only when exact transcript continuity is truly required.",
			"In chain tasks, use `{previous}` deliberately: only include it when the step genuinely depends on the prior output — do not copy it by default.",
			"Use `resumeSessionId` only to continue an existing interrupted child session; do not combine with new task parameters.",
			"After a teammate returns, synthesize or route the result yourself — do not assume the child owns the overall conversation.",
		],
		parameters: DelegateParamsSchema,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			return executeDelegateTool({ pi, params, signal, onUpdate, ctx });
		},

		renderCall: renderDelegateCall,
		renderResult: renderDelegateResult,
	});
}
