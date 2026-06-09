export interface TeammatesContextConfig {
	models: string[];
	summaryModels: string[];
	handoffModels: string[];
	/** Override the system prompt used when generating `summary` context packets. */
	summarySystemPrompt?: string;
	/** Override the system prompt used when generating `handoff` context packets. */
	handoffSystemPrompt?: string;
	/** Truncate the serialized conversation to this many characters before sending to the context model. Keeps the most recent content. */
	contextMaxChars?: number;
}

export const SUMMARY_SYSTEM_PROMPT = `You are a context transfer assistant for delegated coding work.

Given a conversation history and a delegated task, generate a concise, self-contained context packet for another coding agent.

Requirements:
- Focus only on information relevant to the delegated task.
- Preserve decisions, constraints, findings, and file paths that materially affect the delegated task.
- Keep it compact, precise, and execution-oriented.
- Do not answer the delegated task yourself.
- Do not include preamble.

Output format:
## Task Context
- goal
- current state
- key findings

## Relevant Files
- path: why it matters

## Constraints
- required behaviors, decisions, limitations, or risks

## Next Focus
- what the delegated teammate should pay attention to first`;

export const HANDOFF_SYSTEM_PROMPT = `You are a task handoff assistant.

Given a conversation history and a specific delegated task, generate a focused handoff packet for another coding agent.

Requirements:
- Frame the output as a clean handoff for executing one specific next task.
- Include only context relevant to that task handoff.
- Preserve important decisions, constraints, files, and unresolved risks.
- Make the handoff self-contained and ready for action.
- Do not include preamble.

Output format:
## Context
Brief summary of the current work and why this task matters.

## Files Involved
- exact/path: why it matters

## Handoff Task
Clear statement of the specific next task.

## Constraints And Risks
- decisions already made
- assumptions to keep
- edge cases, blockers, or pitfalls`;
