import type { Message } from "@earendil-works/pi-ai";
import type { SingleResult } from "./types.ts";

export function getFinalOutput(messages: Message[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (message.role === "assistant") {
			for (const part of message.content) {
				if (part.type === "text") return part.text;
			}
		}
	}
	return "";
}

export function isFailedResult(result: SingleResult): boolean {
	return result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted";
}

export function isRunningResult(result: SingleResult): boolean {
	if (result.status === "running") return true;
	if (result.status) return false;
	return result.exitCode === -1;
}

export function isFinishedResult(result: SingleResult): boolean {
	return !isRunningResult(result);
}

export function getResultOutput(result: SingleResult): string {
	if (isFailedResult(result)) {
		return result.errorMessage || result.stderr || getFinalOutput(result.messages) || "(no output)";
	}
	return getFinalOutput(result.messages) || "(no output)";
}

export function formatResultMetaLines(result: Pick<SingleResult, "sessionId" | "model">): string[] {
	const lines: string[] = [];
	if (result.sessionId) lines.push(`Session: ${result.sessionId}`);
	if (result.model) lines.push(`Model: ${result.model}`);
	return lines;
}

export function prependResultMeta(result: Pick<SingleResult, "sessionId" | "model">, body: string): string {
	const meta = formatResultMetaLines(result);
	if (meta.length === 0) return body;
	return body.trim().length > 0 ? `${meta.join("\n")}\n\n${body}` : meta.join("\n");
}

export function formatChainResultLabel(result: Pick<SingleResult, "teammate" | "sessionId" | "model">): string {
	let label = `${result.teammate}: ${result.sessionId ?? "unknown"}`;
	if (result.model) label += ` [${result.model}]`;
	return label;
}

export function truncateParallelOutput(output: string, maxBytes: number): string {
	const byteLength = Buffer.byteLength(output, "utf8");
	if (byteLength <= maxBytes) return output;

	let truncated = output.slice(0, maxBytes);
	while (Buffer.byteLength(truncated, "utf8") > maxBytes) {
		truncated = truncated.slice(0, -1);
	}
	return `${truncated}\n\n[Output truncated: ${byteLength - Buffer.byteLength(truncated, "utf8")} bytes omitted. Full output preserved in tool details.]`;
}
