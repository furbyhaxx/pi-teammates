import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { getDisplayItems } from "../display-items.ts";
import {
	getFinalOutput,
	isFailedResult,
	isFinishedResult,
	isRunningResult,
} from "../output.ts";
import type { DelegateDetails, SingleResult } from "../types.ts";
import { formatToolCall, formatUsageStats } from "./format.ts";

export function renderDelegateResult(result: any, options: { expanded: boolean }, theme: any, context: any): Container | Text {
	const { expanded } = options;
	const details = result.details as DelegateDetails | undefined;
	if (!details || details.results.length === 0) {
		const text = result.content[0];
		return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
	}

	const mdTheme = getMarkdownTheme();

	const aggregateUsage = (results: SingleResult[]) => {
		const total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 };
		for (const item of results) {
			total.input += item.usage.input;
			total.output += item.usage.output;
			total.cacheRead += item.usage.cacheRead;
			total.cacheWrite += item.usage.cacheWrite;
			total.cost += item.usage.cost;
			total.turns += item.usage.turns;
		}
		return total;
	};

	const previewText = (value: string, maxLength: number): string => {
		const singleLine = value.replace(/\{previous\}/g, "").replace(/\s+/g, " ").trim();
		const withoutGoal = singleLine.replace(/^goal\s*:\s*/i, "");
		return withoutGoal.length > maxLength ? `${withoutGoal.slice(0, maxLength)}…` : withoutGoal;
	};

	const formatGoal = (task: string): string =>
		theme.fg("muted", "Goal: ") + theme.fg("dim", previewText(task, 78));

	const formatResultHeader = (item: SingleResult, label = item.teammate): string => {
		const usage = formatUsageStats(item.usage, item.model);
		return theme.fg("accent", label) + (usage ? theme.fg("dim", `  · ${usage}`) : "");
	};

	const formatDoneStatus = (item: SingleResult): string => {
		if (isFailedResult(item)) {
			const reason = item.stopReason && item.stopReason !== "end" ? ` [${item.stopReason}]` : "";
			return theme.fg("error", `Error${reason} ✗`);
		}
		return theme.fg("dim", "Done ") + theme.fg("success", "✓");
	};

	const recentToolCalls = (item: SingleResult, count: number) => {
		const toolCalls = getDisplayItems(item.messages).filter((displayItem) => displayItem.type === "toolCall");
		return { hiddenCount: Math.max(0, toolCalls.length - count), calls: toolCalls.slice(-count) };
	};

	const chainArgs = Array.isArray(context?.args?.chain)
		? context.args.chain as Array<{ teammate?: string; task?: string }>
		: undefined;

	if (details.mode === "single" && details.results.length === 1) {
		const single = details.results[0];
		const isError = isFailedResult(single);
		const isRunning = isRunningResult(single);
		const icon = isError ? theme.fg("error", "✗") : theme.fg("success", "✓");
		const displayItems = getDisplayItems(single.messages);
		const finalOutput = getFinalOutput(single.messages);

		if (expanded) {
			const container = new Container();
			let header = `${icon} ${theme.fg("toolTitle", theme.bold(single.teammate))}${theme.fg("muted", ` (${single.teammateSource})`)}`;
			if (isError && single.stopReason) header += ` ${theme.fg("error", `[${single.stopReason}]`)}`;
			container.addChild(new Text(header, 0, 0));
			if (isError && single.errorMessage) {
				container.addChild(new Text(theme.fg("error", `Error: ${single.errorMessage}`), 0, 0));
			}
			container.addChild(new Spacer(1));
			container.addChild(new Text(theme.fg("muted", "─── Task ───"), 0, 0));
			container.addChild(new Text(theme.fg("dim", single.task), 0, 0));
			container.addChild(new Spacer(1));
			container.addChild(new Text(theme.fg("muted", "─── Output ───"), 0, 0));
			if (displayItems.length === 0 && !finalOutput) {
				container.addChild(new Text(theme.fg("muted", "(no output)"), 0, 0));
			} else {
				for (const item of displayItems) {
					if (item.type === "toolCall") {
						container.addChild(
							new Text(formatToolCall(item.name, item.args, theme.fg.bind(theme)), 0, 0),
						);
					}
				}
				if (finalOutput) {
					container.addChild(new Spacer(1));
					container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
				}
			}
			const usageString = formatUsageStats(single.usage, single.model);
			if (usageString) {
				container.addChild(new Spacer(1));
				container.addChild(new Text(theme.fg("dim", usageString), 0, 0));
			}
			return container;
		}

		let text = `${theme.fg("muted", "⎿ ")}${formatResultHeader(single)}`;
		text += `\n  ${theme.fg("muted", "├  ")}${formatGoal(single.task)}`;

		if (isRunning) {
			const { hiddenCount, calls } = recentToolCalls(single, 3);
			if (hiddenCount > 0) text += `\n  ${theme.fg("muted", "├  ")}… +${hiddenCount} tool uses`;
			for (let i = 0; i < calls.length; i++) {
				const connector = i === calls.length - 1 ? "└  " : "├  ";
				const call = calls[i];
				text += `\n  ${theme.fg("muted", connector)}${formatToolCall(call.name, call.args, theme.fg.bind(theme))}`;
			}
			text += calls.length > 0
				? `\n${theme.fg("muted", "       Running…")}`
				: `\n  ${theme.fg("muted", "⎿  Running…")}`;
			text += `\n\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
			return new Text(text, 0, 0);
		}

		if (isError && single.errorMessage) {
			text += `\n  ${theme.fg("muted", "⎿  ")}${theme.fg("error", `${single.errorMessage} ✗`)}`;
		} else {
			text += `\n  ${theme.fg("muted", "⎿  ")}${formatDoneStatus(single)}`;
		}
		text += `\n\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
		return new Text(text, 0, 0);
	}

	if (details.mode === "chain") {
		const completedCount = details.results.filter(isFinishedResult).length;
		const successCount = details.results.filter((item) => isFinishedResult(item) && item.exitCode === 0).length;
		const icon = completedCount < details.results.length
			? theme.fg("warning", "⏳")
			: successCount === details.results.length ? theme.fg("success", "✓") : theme.fg("error", "✗");

		if (expanded) {
			const container = new Container();
			container.addChild(
				new Text(
					icon + " " +
					theme.fg("toolTitle", theme.bold("chain ")) +
					theme.fg("accent", `${successCount}/${details.results.length} steps`),
					0, 0,
				),
			);
			for (const item of details.results) {
				const itemIcon = item.exitCode === 0 ? theme.fg("success", "✓") : theme.fg("error", "✗");
				const displayItems = getDisplayItems(item.messages);
				const finalOutput = getFinalOutput(item.messages);
				container.addChild(new Spacer(1));
				container.addChild(
					new Text(
						theme.fg("muted", `─── Step ${item.step ?? ""}: `) + theme.fg("accent", item.teammate) + " " + itemIcon,
						0, 0,
					),
				);
				container.addChild(new Text(theme.fg("muted", "Task: ") + theme.fg("dim", item.task), 0, 0));
				for (const displayItem of displayItems) {
					if (displayItem.type === "toolCall") {
						container.addChild(new Text(formatToolCall(displayItem.name, displayItem.args, theme.fg.bind(theme)), 0, 0));
					}
				}
				if (finalOutput) {
					container.addChild(new Spacer(1));
					container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
				}
				const stepUsage = formatUsageStats(item.usage, item.model);
				if (stepUsage) container.addChild(new Text(theme.fg("dim", stepUsage), 0, 0));
			}
			const usageString = formatUsageStats(aggregateUsage(details.results));
			if (usageString) {
				container.addChild(new Spacer(1));
				container.addChild(new Text(theme.fg("dim", `Total: ${usageString}`), 0, 0));
			}
			return container;
		}

		// Collapsed chain — tree view
		const runningIndex = details.results.findIndex(isRunningResult);
		const chainTotal = Math.max(details.results.length, chainArgs?.length ?? 0);
		const rootStatus = runningIndex >= 0
			? `chain ${completedCount}/${chainTotal} steps done · step ${details.results[runningIndex].step ?? runningIndex + 1} running`
			: `chain ${successCount}/${chainTotal} steps finished ${successCount === chainTotal ? "✓" : "✗"}`;
		let text = `${theme.fg("muted", "⎿ ")}${theme.fg("toolTitle", theme.bold(rootStatus))}`;
		for (let i = 0; i < details.results.length; i++) {
			const item = details.results[i];
			const isLast = i === chainTotal - 1;
			const branch = theme.fg("muted", isLast ? "  └ " : "  ├ ");
			const cont = isLast ? "    " : theme.fg("muted", "  │ ");
			const itemRunning = isRunningResult(item);
			const stepLabel = `Step ${item.step ?? i + 1}: ${item.teammate}`;
			text += "\n" + branch + formatResultHeader(item, stepLabel);
			text += "\n" + cont + theme.fg("muted", "├  ") + formatGoal(item.task);
			if (itemRunning) {
				const { hiddenCount, calls } = recentToolCalls(item, 1);
				if (hiddenCount > 0) text += "\n" + cont + theme.fg("muted", "├  ") + `… +${hiddenCount} tool uses`;
				const last = calls[calls.length - 1];
				if (last) text += "\n" + cont + theme.fg("muted", "└  ") + formatToolCall(last.name, last.args, theme.fg.bind(theme));
				text += "\n" + cont + theme.fg("muted", last ? "     Running…" : "⎿  Running…");
			} else {
				text += "\n" + cont + theme.fg("muted", "⎿  ") + formatDoneStatus(item);
			}
		}
		if (chainArgs && chainArgs.length > details.results.length) {
			for (let i = details.results.length; i < chainArgs.length; i++) {
				const step = chainArgs[i];
				const isLast = i === chainArgs.length - 1;
				const branch = theme.fg("muted", isLast ? "  └ " : "  ├ ");
				const cont = isLast ? "    " : theme.fg("muted", "  │ ");
				text += "\n" + branch + theme.fg("accent", `Step ${i + 1}: ${step.teammate ?? "…"}`);
				text += "\n" + cont + theme.fg("muted", "├  ") + formatGoal(step.task ?? "…");
				text += "\n" + cont + theme.fg("muted", "⎿  Waiting…");
			}
		}
		if (runningIndex < 0) {
			const usageString = formatUsageStats(aggregateUsage(details.results));
			if (usageString) text += `\n\n${theme.fg("dim", `Total: ${usageString}`)}`;
		}
		text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
		return new Text(text, 0, 0);
	}

	if (details.mode === "parallel") {
		const running = details.results.filter(isRunningResult).length;
		const successCount = details.results.filter((item) => isFinishedResult(item) && !isFailedResult(item)).length;
		const failCount = details.results.filter((item) => isFinishedResult(item) && isFailedResult(item)).length;
		const isRunning = running > 0;
		const icon = isRunning
			? theme.fg("warning", "⏳")
			: failCount > 0 ? theme.fg("warning", "◐") : theme.fg("success", "✓");
		const status = isRunning
			? `${successCount + failCount}/${details.results.length} done · ${running} running`
			: `${successCount}/${details.results.length} tasks`;

		if (expanded && !isRunning) {
			const container = new Container();
			container.addChild(new Text(`${icon} ${theme.fg("toolTitle", theme.bold("parallel "))}${theme.fg("accent", status)}`, 0, 0));
			for (const item of details.results) {
				const itemIcon = isFailedResult(item) ? theme.fg("error", "✗") : theme.fg("success", "✓");
				const displayItems = getDisplayItems(item.messages);
				const finalOutput = getFinalOutput(item.messages);
				container.addChild(new Spacer(1));
				container.addChild(new Text(theme.fg("muted", "─── ") + theme.fg("accent", item.teammate) + " " + itemIcon, 0, 0));
				container.addChild(new Text(theme.fg("muted", "Task: ") + theme.fg("dim", item.task), 0, 0));
				for (const displayItem of displayItems) {
					if (displayItem.type === "toolCall") {
						container.addChild(new Text(formatToolCall(displayItem.name, displayItem.args, theme.fg.bind(theme)), 0, 0));
					}
				}
				if (finalOutput) {
					container.addChild(new Spacer(1));
					container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
				}
				const taskUsage = formatUsageStats(item.usage, item.model);
				if (taskUsage) container.addChild(new Text(theme.fg("dim", taskUsage), 0, 0));
			}
			const usageString = formatUsageStats(aggregateUsage(details.results));
			if (usageString) {
				container.addChild(new Spacer(1));
				container.addChild(new Text(theme.fg("dim", `Total: ${usageString}`), 0, 0));
			}
			return container;
		}

		// Collapsed parallel — tree view
		const finishedCount = successCount + failCount;
		const rootStatus = isRunning
			? `parallel ${finishedCount}/${details.results.length} done · ${running} running`
			: `parallel ${finishedCount}/${details.results.length} teammates finished ${failCount > 0 ? `· ${failCount} failed ◐` : "✓"}`;
		let text = `${theme.fg("muted", "⎿ ")}${theme.fg("toolTitle", theme.bold(rootStatus))}`;
		for (let i = 0; i < details.results.length; i++) {
			const item = details.results[i];
			const isLast = i === details.results.length - 1;
			const branch = theme.fg("muted", isLast ? "  └ " : "  ├ ");
			const cont = isLast ? "    " : theme.fg("muted", "  │ ");
			const itemRunning = isRunningResult(item);
			text += "\n" + branch + formatResultHeader(item);
			text += "\n" + cont + theme.fg("muted", "├  ") + formatGoal(item.task);
			if (itemRunning) {
				const { hiddenCount, calls } = recentToolCalls(item, 1);
				if (hiddenCount > 0) text += "\n" + cont + theme.fg("muted", "├  ") + `… +${hiddenCount} tool uses`;
				const last = calls[calls.length - 1];
				if (last) text += "\n" + cont + theme.fg("muted", "└  ") + formatToolCall(last.name, last.args, theme.fg.bind(theme));
				text += "\n" + cont + theme.fg("muted", last ? "     Running…" : "⎿  Running…");
			} else {
				text += "\n" + cont + theme.fg("muted", "⎿  ") + formatDoneStatus(item);
			}
		}
		if (!isRunning) {
			const usageString = formatUsageStats(aggregateUsage(details.results));
			if (usageString) text += `\n\n${theme.fg("dim", `Total: ${usageString}`)}`;
		}
		if (!expanded) text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
		return new Text(text, 0, 0);
	}

	const text = result.content[0];
	return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
}
