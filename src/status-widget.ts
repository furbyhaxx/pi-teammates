import { copyToClipboard, type ExtensionCommandContext, type SessionEntry } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, type Focusable } from "@earendil-works/pi-tui";
import { collectLatestTeammateJobs, type TeammateJobRecord } from "./job-registry.ts";

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
				new StatusOverlayComponent(theme, () => collectJobs(args.ctx.sessionManager.getEntries()), done, () =>
					tui.requestRender(),
				),
			{ overlay: true },
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
				const inner = Math.max(20, width - 2);
				return [
					theme.fg("accent", `┌${"─".repeat(inner)}┐`),
					...lines.map((line) => theme.fg("accent", "│") + truncateToWidth(` ${line}`, inner) + theme.fg("accent", "│")),
					theme.fg("accent", `└${"─".repeat(inner)}┘`),
					theme.fg("dim", "Enter or Esc to close"),
				];
			},
			invalidate() {},
			handleInput(data: string) {
				if (matchesKey(data, "enter") || matchesKey(data, "escape")) done();
			},
		};
	}, { overlay: true });
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
	) {
		this.refreshTimer = setInterval(() => this.requestRender(), 750);
	}

	render(width: number): string[] {
		const jobs = this.getJobs();
		const maxWidth = Math.max(60, Math.min(width, 120));
		const rows: string[] = [];
		const border = this.theme.fg("accent", `┌${"─".repeat(maxWidth - 2)}┐`);
		rows.push(border);
		rows.push(this.row(maxWidth, this.theme.bold(" Teammate activity")));
		rows.push(this.row(maxWidth, this.theme.fg("dim", padColumns(["Status", "Teammate", "Context", "Session", "Task"], [8, 16, 12, 14, maxWidth - 54]))));
		rows.push(this.row(maxWidth, this.theme.fg("dim", "─".repeat(maxWidth - 4))));

		if (jobs.length === 0) {
			rows.push(this.row(maxWidth, this.theme.fg("muted", " No teammate activity recorded in this session.")));
		} else {
			for (let i = 0; i < jobs.length; i++) {
				const job = jobs[i]!;
				const selected = i === this.selected;
				const columns = padColumns(
					[
						statusLabel(job.status),
						job.teammateName,
						job.contextMode,
						job.childSessionId,
						job.task,
					],
					[8, 16, 12, 14, maxWidth - 54],
				);
				rows.push(this.row(maxWidth, selected ? this.theme.bg("selectedBg", this.theme.fg("text", columns)) : columns));
			}
		}

		rows.push(this.row(maxWidth, this.theme.fg("dim", "─".repeat(maxWidth - 4))));
		rows.push(this.row(maxWidth, this.theme.fg("dim", " [Enter] Inspect session   [r] Resume   [c] Copy id   [Esc] Close")));
		rows.push(this.theme.fg("accent", `└${"─".repeat(maxWidth - 2)}┘`));
		return rows.map((line) => truncateToWidth(line, width));
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
		const inner = width - 4;
		return this.theme.fg("accent", "│") + truncateToWidth(` ${content}`, inner) + " ".repeat(Math.max(0, inner - visibleTextWidth(content) - 1)) + this.theme.fg("accent", "│");
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
		.map((value, index) => truncateToWidth(value, widths[index] ?? value.length).padEnd(widths[index] ?? value.length))
		.join("  ");
}

function visibleTextWidth(value: string): number {
	return value.replace(/\x1b\[[0-9;]*m/g, "").length;
}
