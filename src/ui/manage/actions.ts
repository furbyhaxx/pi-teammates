import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getAgentDir, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { buildTeammateTemplate } from "../../command-helpers.ts";
import { loadTeammatesConfig } from "../../config.ts";
import { discoverTeammates, findNearestProjectTeammatesDir, parseTeammateMarkdown, type TeammateConfig } from "../../teammates.ts";
import { buildResponsiveOverlayOptions } from "../overlay-layout.ts";
import { ManageOverlayComponent } from "./component.ts";

export type ManageAction =
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
			await editTeammateFile(ctx, action.teammate);
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

async function editTeammateFile(ctx: ExtensionCommandContext, teammate: TeammateConfig): Promise<void> {
	if (teammate.source === "builtin") {
		ctx.ui.notify("Builtin teammates are read-only. Run /team:eject project or /team:eject user first.", "warning");
		return;
	}
	const current = await readFile(teammate.filePath, "utf-8");
	const edited = await ctx.ui.editor(`Edit teammate: ${path.basename(teammate.filePath)}`, current);
	if (edited === undefined || edited === current) return;
	parseTeammateMarkdown(teammate.filePath, teammate.source, edited);
	await writeFile(teammate.filePath, edited, "utf-8");
	ctx.ui.notify(`Saved ${path.basename(teammate.filePath)}`, "info");
}

async function duplicateTeammate(ctx: ExtensionCommandContext, teammate: TeammateConfig): Promise<void> {
	if (teammate.source === "builtin") {
		ctx.ui.notify("Builtin teammates are read-only. Run /team:eject project or /team:eject user first.", "warning");
		return;
	}
	const duplicateName = await ctx.ui.input("Duplicate teammate", `${teammate.name}-copy`);
	if (!duplicateName) return;
	const validatedName = validateTeammateName(duplicateName);
	if (!validatedName) {
		ctx.ui.notify("Teammate names must use letters, numbers, and hyphens only.", "warning");
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
	if (teammate.source === "builtin") {
		ctx.ui.notify("Builtin teammates are read-only. Run /team:eject project or /team:eject user first.", "warning");
		return;
	}
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
		ctx.ui.notify("Teammate names must use letters, numbers, and hyphens only.", "warning");
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
		await access(targetPath);
		return true;
	} catch {
		return false;
	}
}

function validateTeammateName(value: string): string | undefined {
	const trimmed = value.trim();
	return /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(trimmed) ? trimmed : undefined;
}
