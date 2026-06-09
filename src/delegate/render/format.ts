import * as os from "node:os";

export function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1000000).toFixed(1)}M`;
}

export function formatUsageStats(
	usage: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		cost: number;
		contextTokens?: number;
		turns?: number;
	},
	model?: string,
): string {
	const parts: string[] = [];
	if (usage.turns) parts.push(`${usage.turns} turn${usage.turns > 1 ? "s" : ""}`);
	const totalTokens = (usage.contextTokens && usage.contextTokens > 0)
		? usage.contextTokens
		: usage.input + usage.output + usage.cacheRead;
	if (totalTokens > 0) parts.push(`${formatTokens(totalTokens)} tokens`);
	if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
	if (model) parts.push(model);
	return parts.join(" · ");
}

export function formatToolCall(
	toolName: string,
	args: Record<string, unknown>,
	themeFg: (color: any, text: string) => string,
): string {
	const shortenPath = (targetPath: string) => {
		const home = os.homedir();
		return targetPath.startsWith(home) ? `~${targetPath.slice(home.length)}` : targetPath;
	};

	const call = (label: string, arg: string) =>
		themeFg("accent", label) + themeFg("muted", "(") + themeFg("toolOutput", arg) + themeFg("muted", ")");

	switch (toolName) {
		case "bash":
		case "shell_exec": {
			const command = ((args.command as string) || (args.cmd as string) || "…") as string;
			const preview = command.length > 60 ? `${command.slice(0, 60)}…` : command;
			return call("Bash", preview);
		}
		case "shell_write_stdin": {
			const sessionId = String(args.session_id ?? "?");
			const chars = typeof args.chars === "string" ? args.chars : "";
			if (!chars) return themeFg("accent", "Bash") + themeFg("muted", `(poll session ${sessionId})`);
			const preview = chars.length > 32 ? `${chars.slice(0, 32)}…` : chars;
			return call("Bash", `stdin ${sessionId} ${preview}`);
		}
		case "shell_kill_session": {
			const sessionId = String(args.session_id ?? "?");
			const signal = typeof args.signal === "string" ? ` ${args.signal}` : "";
			return call("Bash", `kill ${sessionId}${signal}`);
		}
		case "shell_list_sessions": {
			return themeFg("accent", "Bash") + themeFg("muted", "(list sessions)");
		}
		case "read": {
			const rawPath = (args.file_path || args.path || "…") as string;
			const filePath = shortenPath(rawPath);
			const offset = args.offset as number | undefined;
			const limit = args.limit as number | undefined;
			let arg = filePath;
			if (offset !== undefined || limit !== undefined) {
				const startLine = offset ?? 1;
				const endLine = limit !== undefined ? startLine + limit - 1 : "";
				arg += `:${startLine}${endLine ? `-${endLine}` : ""}`;
			}
			return call("Read", arg);
		}
		case "write": {
			const rawPath = (args.file_path || args.path || "…") as string;
			const filePath = shortenPath(rawPath);
			const content = (args.content || "") as string;
			const lines = content.split("\n").length;
			const arg = lines > 1 ? `${filePath}, ${lines} lines` : filePath;
			return call("Write", arg);
		}
		case "edit": {
			const rawPath = (args.file_path || args.path || "…") as string;
			return call("Edit", shortenPath(rawPath));
		}
		case "ls": {
			const rawPath = (args.path || ".") as string;
			return call("LS", shortenPath(rawPath));
		}
		case "find": {
			const pattern = (args.pattern || "*") as string;
			const rawPath = (args.path || ".") as string;
			return call("Find", `${pattern} in ${shortenPath(rawPath)}`);
		}
		case "grep": {
			const pattern = (args.pattern || "") as string;
			const rawPath = (args.path || ".") as string;
			return call("Grep", `/${pattern}/ in ${shortenPath(rawPath)}`);
		}
		default: {
			const argsStr = JSON.stringify(args);
			const preview = argsStr.length > 50 ? `${argsStr.slice(0, 50)}…` : argsStr;
			const label = toolName.charAt(0).toUpperCase() + toolName.slice(1);
			return call(label, preview);
		}
	}
}
