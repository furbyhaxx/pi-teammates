import { copyToClipboard, type ExtensionCommandContext, type SessionEntry } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, type Focusable } from "@earendil-works/pi-tui";
import { collectLatestTeammateJobs, type TeammateJobRecord } from "./job-registry.ts";
import {
	buildResponsiveOverlayOptions,
	getLargeModalLayout,
	getStatusColumnWidths,
	getVisibleWindow,
	padRowsToCount,
	padToVisibleWidth,
} from "./overlay-layout.ts";

interface StatusAction {
	action: "inspect" | "resume" | "copy" | "close";
	sessionId?: string;
}

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

function collectJobs(entries: SessionEntry[]): TeammateJobRecord[] {
	return Array.from(collectLatestTeammateJobs(entries).values()).sort((left, right) =>
		right.updatedAt.localeCompare(left.updatedAt),
	);
}

async function showJobDetails(ctx: ExtensionCommandContext, job: TeammateJobRecord): Promise<void> {
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
				];
			},
			invalidate() {},
			handleInput(data: string) {
				if (matchesKey(data, "enter") || matchesKey(data, "escape")) done();
			},
		};
	}, { overlay: true, overlayOptions: buildResponsiveOverlayOptions(64) });
}

class StatusOverlayComponent implements Focusable {
	focused = false;
	private selected = 0;
	private readonly refreshTimer: NodeJS.Timeout;

	constructor(
		private readonly theme: ExtensionCommandContext["ui"]["theme"],
		private readonly getJobs: () => TeammateJobRecord[],
		private readonly done: (action: StatusAction | undefined) => void,
		private readonly requestRender: () => void,
		private readonly getTerminalRows: () => number,
	) {
		this.refreshTimer = setInterval(() => this.requestRender(), 750);
	}

	render(width: number): string[] {
		const jobs = this.getJobs();
		this.selected = Math.min(this.selected, Math.max(0, jobs.length - 1));
		const panelWidth = width;
		const columnWidths = getStatusColumnWidths(panelWidth);
		const layout = getLargeModalLayout({ terminalRows: this.getTerminalRows(), chromeRows: 7 });
		if (layout.contentRows < 1) {
			return this.renderCompact(panelWidth, jobs);
		}
		const visibleWindow = getVisibleWindow({
			itemCount: jobs.length,
			selectedIndex: this.selected,
			maxVisibleItems: layout.contentRows,
		});
		const visibleJobs = jobs.slice(visibleWindow.start, visibleWindow.end);
		const rows: string[] = [];
		const border = this.theme.fg("accent", `┌${"─".repeat(Math.max(0, panelWidth - 2))}┐`);
		rows.push(border);
		rows.push(this.row(panelWidth, this.theme.bold(" Teammate activity")));
		rows.push(
			this.row(
				panelWidth,
				this.theme.fg("dim", padColumns(["Status", "Teammate", "Context", "Session", "Task"], columnWidths)),
			),
		);
		rows.push(this.row(panelWidth, this.theme.fg("dim", "─".repeat(Math.max(0, panelWidth - 4)))));

		const contentRows: string[] = [];
		if (jobs.length === 0) {
			contentRows.push(this.row(panelWidth, this.theme.fg("muted", " No teammate activity recorded in this session.")));
		} else {
			for (let index = 0; index < visibleJobs.length; index++) {
				const jobIndex = visibleWindow.start + index;
				const job = visibleJobs[index]!;
				const selected = jobIndex === this.selected;
				const columns = padColumns(
					[
						statusLabel(job.status),
						job.teammateName,
						job.contextMode,
						job.childSessionId,
						job.task,
					],
					columnWidths,
				);
				contentRows.push(this.row(panelWidth, selected ? this.theme.bg("selectedBg", this.theme.fg("text", columns)) : columns));
			}
		}
		rows.push(...padRowsToCount(contentRows, layout.contentRows, this.row(panelWidth, "")));

		rows.push(this.row(panelWidth, this.theme.fg("dim", "─".repeat(Math.max(0, panelWidth - 4)))));
		rows.push(this.row(panelWidth, this.theme.fg("dim", this.footerText(panelWidth, visibleWindow.start, Math.max(0, jobs.length - visibleWindow.end)))));
		rows.push(this.theme.fg("accent", `└${"─".repeat(Math.max(0, panelWidth - 2))}┘`));
		return rows.map((line) => truncateToWidth(line, panelWidth));
	}

	invalidate(): void {}

	handleInput(data: string): void {
		const jobs = this.getJobs();
		if (matchesKey(data, "escape")) {
			this.done({ action: "close" });
			return;
		}
		if (matchesKey(data, "up")) {
			this.selected = Math.max(0, this.selected - 1);
			return;
		}
		if (matchesKey(data, "down")) {
			this.selected = Math.min(Math.max(0, jobs.length - 1), this.selected + 1);
			return;
		}
		const job = jobs[this.selected];
		if (!job) return;
		if (matchesKey(data, "enter")) {
			this.done({ action: "inspect", sessionId: job.childSessionId });
			return;
		}
		if (data === "r") {
			if (job.status === "running" || job.status === "completed") return;
			this.done({ action: "resume", sessionId: job.childSessionId });
			return;
		}
		if (data === "c") {
			this.done({ action: "copy", sessionId: job.childSessionId });
		}
	}

	dispose(): void {
		clearInterval(this.refreshTimer);
	}

	private row(width: number, content: string): string {
		const inner = Math.max(1, width - 4);
		const display = padToVisibleWidth(content, inner);
		return this.theme.fg("accent", "│") + " " + display + " " + this.theme.fg("accent", "│");
	}

	private renderCompact(width: number, jobs: TeammateJobRecord[]): string[] {
		const rows: string[] = [];
		rows.push(this.theme.fg("accent", `┌${"─".repeat(Math.max(0, width - 2))}┐`));
		rows.push(this.row(width, this.theme.bold("Teammate activity")));
		const job = jobs[this.selected];
		if (!job) {
			rows.push(this.row(width, this.theme.fg("muted", "No teammate activity.")));
		} else {
			const summary = `${statusLabel(job.status)} ${job.teammateName} — ${job.task}`;
			rows.push(this.row(width, this.theme.bg("selectedBg", this.theme.fg("text", summary))));
		}
		rows.push(this.row(width, this.theme.fg("dim", "Esc close")));
		rows.push(this.theme.fg("accent", `└${"─".repeat(Math.max(0, width - 2))}┘`));
		return rows.map((line) => truncateToWidth(line, width));
	}

	private footerText(panelWidth: number, hiddenAbove: number, hiddenBelow: number): string {
		const scrollHint = hiddenAbove > 0 || hiddenBelow > 0 ? `↑${hiddenAbove} ↓${hiddenBelow} ` : "";
		if (panelWidth <= 88) {
			return `${scrollHint}Enter inspect  r resume  c copy  Esc close`;
		}
		return `${scrollHint}[Enter] Inspect session   [r] Resume   [c] Copy id   [Esc] Close`;
	}
}

function statusLabel(status: TeammateJobRecord["status"]): string {
	switch (status) {
		case "running":
			return "RUN";
		case "completed":
			return "DONE";
		case "failed":
			return "FAIL";
		case "aborted":
			return "ABRT";
		case "interrupted":
			return "INT";
	}
}

function padColumns(values: string[], widths: number[]): string {
	return values
		.map((value, index) => padToVisibleWidth(value, widths[index] ?? value.length))
		.join("  ");
}
