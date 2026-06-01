import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getAgentDir, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, type Focusable } from "@earendil-works/pi-tui";
import { buildTeammateTemplate } from "./command-helpers.ts";
import { loadTeammatesConfig } from "./config.ts";
import {
	buildResponsiveOverlayOptions,
	getLargeModalLayout,
	getManageColumnWidths,
	getVisibleWindow,
	padRowsToCount,
	padToVisibleWidth,
} from "./overlay-layout.ts";
import { discoverTeammates, findNearestProjectTeammatesDir, parseTeammateMarkdown, type TeammateConfig } from "./teammates.ts";

type ManageAction =
	| { action: "close" }
	| { action: "edit"; teammate: TeammateConfig }
	| { action: "duplicate"; teammate: TeammateConfig }
	| { action: "delete"; teammate: TeammateConfig }
	| { action: "new" };

export async function runTeammateManager(ctx: ExtensionCommandContext): Promise<void> {
	while (true) {
		const action = await ctx.ui.custom<ManageAction | undefined>(
			(tui, theme, _kb, done) =>
				new ManageOverlayComponent(
					theme,
					() =>
						discoverTeammates(ctx.cwd, {
							loadProjectTeammates: loadTeammatesConfig(ctx.cwd).config.teammates.loadProjectTeammates,
						}),
					done,
					() => tui.terminal.rows,
				),
			{ overlay: true, overlayOptions: buildResponsiveOverlayOptions(72) },
		);

		if (!action || action.action === "close") return;
		if (action.action === "edit") {
			await editTeammateFile(ctx, action.teammate.filePath);
			continue;
		}
		if (action.action === "duplicate") {
			await duplicateTeammate(ctx, action.teammate);
			continue;
		}
		if (action.action === "delete") {
			await deleteTeammate(ctx, action.teammate);
			continue;
		}
		if (action.action === "new") {
			await createTeammate(ctx);
		}
	}
}

async function editTeammateFile(ctx: ExtensionCommandContext, filePath: string): Promise<void> {
	const current = await readFile(filePath, "utf-8");
	const edited = await ctx.ui.editor(`Edit teammate: ${path.basename(filePath)}`, current);
	if (edited === undefined || edited === current) return;
	parseTeammateMarkdown(filePath, "user", edited);
	await writeFile(filePath, edited, "utf-8");
	ctx.ui.notify(`Saved ${path.basename(filePath)}`, "info");
}

async function duplicateTeammate(ctx: ExtensionCommandContext, teammate: TeammateConfig): Promise<void> {
	const duplicateName = await ctx.ui.input("Duplicate teammate", `${teammate.name}-copy`);
	if (!duplicateName) return;
	const validatedName = validateTeammateName(duplicateName);
	if (!validatedName) {
		ctx.ui.notify("Teammate names must use lowercase letters, numbers, and hyphens only.", "warning");
		return;
	}
	const content = await readFile(teammate.filePath, "utf-8");
	const updated = content.replace(/^name:\s+.*$/m, `name: ${validatedName}`);
	const targetPath = path.join(path.dirname(teammate.filePath), `${validatedName}.md`);
	if (await fileExists(targetPath)) {
		ctx.ui.notify(`${path.basename(targetPath)} already exists`, "warning");
		return;
	}
	parseTeammateMarkdown(targetPath, teammate.source, updated);
	await writeFile(targetPath, updated, "utf-8");
	ctx.ui.notify(`Created ${path.basename(targetPath)}`, "info");
}

async function deleteTeammate(ctx: ExtensionCommandContext, teammate: TeammateConfig): Promise<void> {
	const confirmed = await ctx.ui.confirm(
		"Delete teammate?",
		`${teammate.name}\n${teammate.filePath}\n\nThis removes the teammate file from disk.`,
	);
	if (!confirmed) return;
	await rm(teammate.filePath);
	ctx.ui.notify(`Deleted ${teammate.name}`, "info");
}

async function createTeammate(ctx: ExtensionCommandContext): Promise<void> {
	const scope = await ctx.ui.select("Create teammate in which scope?", ["project", "user"]);
	if (!scope) return;
	const name = await ctx.ui.input("New teammate name", "new-teammate");
	if (!name) return;
	const validatedName = validateTeammateName(name);
	if (!validatedName) {
		ctx.ui.notify("Teammate names must use lowercase letters, numbers, and hyphens only.", "warning");
		return;
	}
	const description = await ctx.ui.input("New teammate description", "Describe what this teammate specializes in");
	if (!description) return;
	const fileName = `${validatedName}.md`;
	const dir =
		scope === "project"
			? findNearestProjectTeammatesDir(ctx.cwd) ?? path.join(ctx.cwd, ".pi", "teammates")
			: path.join(getAgentDir(), "teammates");
		await mkdir(dir, { recursive: true });
	const targetPath = path.join(dir, fileName);
	if (await fileExists(targetPath)) {
		ctx.ui.notify(`${fileName} already exists`, "warning");
		return;
	}
	const template = buildTeammateTemplate({ name: validatedName, description: description.trim() });
	const edited = await ctx.ui.editor(`Create teammate: ${fileName}`, template);
	if (edited === undefined) return;
	parseTeammateMarkdown(targetPath, scope === "project" ? "project" : "user", edited);
	await writeFile(targetPath, edited, "utf-8");
	ctx.ui.notify(`Created ${fileName}`, "info");
}

async function fileExists(targetPath: string): Promise<boolean> {
	try {
		await readFile(targetPath, "utf-8");
		return true;
	} catch {
		return false;
	}
}

function validateTeammateName(value: string): string | undefined {
	const trimmed = value.trim();
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed) ? trimmed : undefined;
}

class ManageOverlayComponent implements Focusable {
	focused = false;
	private selected = 0;

	constructor(
		private readonly theme: ExtensionCommandContext["ui"]["theme"],
		private readonly getDiscovery: () => ReturnType<typeof discoverTeammates>,
		private readonly done: (result: ManageAction | undefined) => void,
		private readonly getTerminalRows: () => number,
	) {}

	render(width: number): string[] {
		const teammates = this.getDiscovery().teammates;
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
		rows.push(this.row(panelWidth, this.theme.fg("dim", this.footerText(panelWidth, visibleWindow.start, Math.max(0, teammates.length - visibleWindow.end)))));
		rows.push(this.theme.fg("accent", `└${"─".repeat(Math.max(0, panelWidth - 2))}┘`));
		return rows.map((line) => truncateToWidth(line, panelWidth));
	}

	invalidate(): void {}

	handleInput(data: string): void {
		const teammates = this.getDiscovery().teammates;
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
		return `${scrollHint}[Enter] Edit   [n] New teammate   [d] Duplicate   [x] Delete   [Esc] Close`;
	}
}

function columns(values: string[], widths: number[]): string {
	return values
		.map((value, index) => padToVisibleWidth(value, widths[index] ?? value.length))
		.join("  ");
}
