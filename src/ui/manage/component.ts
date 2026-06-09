import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, type Focusable } from "@earendil-works/pi-tui";
import type { discoverTeammates, TeammateConfig } from "../../teammates.ts";
import {
	getLargeModalLayout,
	getManageColumnWidths,
	getVisibleWindow,
	padRowsToCount,
	padToVisibleWidth,
} from "../overlay-layout.ts";
import type { ManageAction } from "./actions.ts";

export class ManageOverlayComponent implements Focusable {
	focused = false;
	private selected = 0;
	// Cache discovery for the lifetime of this component instance (recreated after each action).
	private readonly discovery: ReturnType<typeof discoverTeammates>;

	constructor(
		private readonly theme: ExtensionCommandContext["ui"]["theme"],
		private readonly getDiscovery: () => ReturnType<typeof discoverTeammates>,
		private readonly done: (result: ManageAction | undefined) => void,
		private readonly getTerminalRows: () => number,
	) {
		this.discovery = this.getDiscovery();
	}

	render(width: number): string[] {
		const { teammates, warnings } = this.discovery;
		this.selected = Math.min(this.selected, Math.max(0, teammates.length - 1));
		const panelWidth = width;
		const columnWidths = getManageColumnWidths(panelWidth);
		const layout = getLargeModalLayout({ terminalRows: this.getTerminalRows(), chromeRows: 7 });
		if (layout.contentRows < 1) {
			return this.renderCompact(panelWidth, teammates);
		}
		const visibleWindow = getVisibleWindow({
			itemCount: teammates.length,
			selectedIndex: this.selected,
			maxVisibleItems: layout.contentRows,
		});
		const visibleTeammates = teammates.slice(visibleWindow.start, visibleWindow.end);
		const rows: string[] = [];
		rows.push(this.theme.fg("accent", `┌${"─".repeat(Math.max(0, panelWidth - 2))}┐`));
		rows.push(this.row(panelWidth, this.theme.bold(" Teammates")));
		rows.push(
			this.row(
				panelWidth,
				this.theme.fg("dim", columns(["Name", "Context", "Model", "Delegate", "Source"], columnWidths)),
			),
		);
		rows.push(this.row(panelWidth, this.theme.fg("dim", "─".repeat(Math.max(0, panelWidth - 4)))));

		const contentRows: string[] = [];
		if (teammates.length === 0) {
			contentRows.push(this.row(panelWidth, this.theme.fg("muted", " No teammates found. Press n to create one.")));
		} else {
			for (let index = 0; index < visibleTeammates.length; index++) {
				const teammateIndex = visibleWindow.start + index;
				const teammate = visibleTeammates[index]!;
				const isSelected = teammateIndex === this.selected;
				const line = columns(
					[
						teammate.name,
						teammate.contextMode,
						teammate.model || "(session default)",
						teammate.tools?.delegate === true ? "yes" : "no",
						teammate.source,
					],
					columnWidths,
				);
				contentRows.push(this.row(panelWidth, isSelected ? this.theme.bg("selectedBg", this.theme.fg("text", line)) : line));
			}
		}
		rows.push(...padRowsToCount(contentRows, layout.contentRows, this.row(panelWidth, "")));

		rows.push(this.row(panelWidth, this.theme.fg("dim", "─".repeat(Math.max(0, panelWidth - 4)))));
		const warningNote = warnings.length > 0 ? this.theme.fg("warning", ` ⚠ ${warnings.length} file(s) skipped: ${warnings.slice(0, 2).join("; ")}${warnings.length > 2 ? "; …" : ""}`) : "";
		rows.push(this.row(panelWidth, this.theme.fg("dim", this.footerText(panelWidth, visibleWindow.start, Math.max(0, teammates.length - visibleWindow.end))) + warningNote));
		rows.push(this.theme.fg("accent", `└${"─".repeat(Math.max(0, panelWidth - 2))}┘`));
		return rows.map((line) => truncateToWidth(line, panelWidth));
	}

	invalidate(): void {}

	handleInput(data: string): void {
		const { teammates } = this.discovery;
		if (matchesKey(data, "escape")) {
			this.done({ action: "close" });
			return;
		}
		if (matchesKey(data, "up")) {
			this.selected = Math.max(0, this.selected - 1);
			return;
		}
		if (matchesKey(data, "down")) {
			this.selected = Math.min(Math.max(0, teammates.length - 1), this.selected + 1);
			return;
		}
		if (data === "n") {
			this.done({ action: "new" });
			return;
		}
		const teammate = teammates[this.selected];
		if (!teammate) return;
		if (matchesKey(data, "enter")) {
			this.done({ action: "edit", teammate });
			return;
		}
		if (data === "d") {
			this.done({ action: "duplicate", teammate });
			return;
		}
		if (data === "x") {
			this.done({ action: "delete", teammate });
		}
	}

	private row(width: number, content: string): string {
		const inner = Math.max(1, width - 4);
		const display = padToVisibleWidth(content, inner);
		return this.theme.fg("accent", "│") + " " + display + " " + this.theme.fg("accent", "│");
	}

	private renderCompact(width: number, teammates: TeammateConfig[]): string[] {
		const rows: string[] = [];
		rows.push(this.theme.fg("accent", `┌${"─".repeat(Math.max(0, width - 2))}┐`));
		rows.push(this.row(width, this.theme.bold("Teammates")));
		const teammate = teammates[this.selected];
		if (!teammate) {
			rows.push(this.row(width, this.theme.fg("muted", "No teammates found. Press n to create one.")));
		} else {
			const summary = `${teammate.name} — ${teammate.model || "(session default)"}`;
			rows.push(this.row(width, this.theme.bg("selectedBg", this.theme.fg("text", summary))));
		}
		rows.push(this.row(width, this.theme.fg("dim", "n new  d dup  x del  Esc close")));
		rows.push(this.theme.fg("accent", `└${"─".repeat(Math.max(0, width - 2))}┘`));
		return rows.map((line) => truncateToWidth(line, width));
	}

	private footerText(panelWidth: number, hiddenAbove: number, hiddenBelow: number): string {
		const scrollHint = hiddenAbove > 0 || hiddenBelow > 0 ? `↑${hiddenAbove} ↓${hiddenBelow} ` : "";
		if (panelWidth <= 88) {
			return `${scrollHint}Enter edit  n new  d dup  x del  Esc close`;
		}
		return `${scrollHint}[Enter] Edit   [n] New teammate   [d] Duplicate   [x] Delete   [Esc] Close   [/team:eject] Copy builtins`;
	}
}

function columns(values: string[], widths: number[]): string {
	return values
		.map((value, index) => padToVisibleWidth(value, widths[index] ?? value.length))
		.join("  ");
}
