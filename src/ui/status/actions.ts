import { copyToClipboard, type ExtensionCommandContext, type SessionEntry } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { collectLatestTeammateJobs } from "../../jobs/queries.ts";
import type { TeammateJobRecord } from "../../jobs/types.ts";
import { buildResponsiveOverlayOptions, getLargeModalLayout, padRowsToCount, padToVisibleWidth } from "../overlay-layout.ts";
import { StatusOverlayComponent, type StatusAction } from "./component.ts";

export async function showTeammateStatusOverlay(args: {
	ctx: ExtensionCommandContext;
	onResume: (sessionId: string) => Promise<void>;
}): Promise<void> {
	let pendingResume: string | undefined;

	while (true) {
		const action = await args.ctx.ui.custom<StatusAction | undefined>(
			(tui, theme, _kb, done) =>
				new StatusOverlayComponent(
					theme,
					() => collectJobs(args.ctx.sessionManager.getEntries()),
					done,
					() => tui.requestRender(),
					() => tui.terminal.rows,
				),
			{ overlay: true, overlayOptions: buildResponsiveOverlayOptions(72) },
		);

		if (!action || action.action === "close") return;
		if (!action.sessionId) continue;

		if (action.action === "inspect") {
			const job = collectJobs(args.ctx.sessionManager.getEntries()).find((item) => item.childSessionId === action.sessionId);
			if (!job) {
				args.ctx.ui.notify(`No teammate job found for ${action.sessionId}`, "warning");
				continue;
			}
			await showJobDetails(args.ctx, job);
			continue;
		}

		if (action.action === "copy") {
			try {
				await copyToClipboard(action.sessionId);
				args.ctx.ui.notify(`Copied ${action.sessionId}`, "info");
			} catch (error) {
				args.ctx.ui.notify(error instanceof Error ? error.message : String(error), "warning");
			}
			continue;
		}

		if (action.action === "resume") {
			pendingResume = action.sessionId;
			break;
		}
	}

	if (pendingResume) {
		await args.onResume(pendingResume);
	}
}

export function collectJobs(entries: SessionEntry[]): TeammateJobRecord[] {
	return Array.from(collectLatestTeammateJobs(entries).values()).sort((left, right) =>
		right.updatedAt.localeCompare(left.updatedAt),
	);
}

export async function showJobDetails(ctx: ExtensionCommandContext, job: TeammateJobRecord): Promise<void> {
	await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
		const lines = [
			`Teammate: ${job.teammateName}`,
			`Status:   ${job.status}`,
			`Context:  ${job.contextMode}`,
			`Session:  ${job.childSessionId}`,
			`Model:    ${job.model ?? "(session default)"}`,
			`Cwd:      ${job.cwd}`,
			"",
			"Task:",
			job.task,
			"",
			`Updated: ${job.updatedAt}`,
		];
		return {
			render(width: number) {
				const inner = Math.max(1, width - 2);
				const layout = getLargeModalLayout({ terminalRows: _tui.terminal.rows, chromeRows: 3 });
				const visibleLines = lines.length > layout.contentRows ? [...lines.slice(0, Math.max(1, layout.contentRows - 1)), "…"] : lines;
				const paddedLines = padRowsToCount(visibleLines, layout.contentRows);
				const row = (line: string) => {
					const content = padToVisibleWidth(` ${line}`, inner);
					return theme.fg("accent", "│") + content + theme.fg("accent", "│");
				};
				return [
					theme.fg("accent", `┌${"─".repeat(Math.max(0, inner))}┐`),
					...paddedLines.map(row),
					theme.fg("accent", `└${"─".repeat(Math.max(0, inner))}┘`),
					theme.fg("dim", "Enter or Esc to close"),
				].map((line) => truncateToWidth(line, width));
			},
			invalidate() {},
			handleInput(data: string) {
				if (matchesKey(data, "enter") || matchesKey(data, "escape")) done();
			},
		};
	}, { overlay: true, overlayOptions: buildResponsiveOverlayOptions(64) });
}
