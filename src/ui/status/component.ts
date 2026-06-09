import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, type Focusable } from "@earendil-works/pi-tui";
import type { TeammateJobRecord } from "../../job-registry.ts";
import {
	getLargeModalLayout,
	getStatusColumnWidths,
	getVisibleWindow,
	padRowsToCount,
	padToVisibleWidth,
} from "../overlay-layout.ts";

export interface StatusAction {
	action: "inspect" | "resume" | "copy" | "close";
	sessionId?: string;
}

export class StatusOverlayComponent implements Focusable {
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

export function statusLabel(status: TeammateJobRecord["status"]): string {
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

export function padColumns(values: string[], widths: number[]): string {
	return values
		.map((value, index) => padToVisibleWidth(value, widths[index] ?? value.length))
		.join("  ");
}
