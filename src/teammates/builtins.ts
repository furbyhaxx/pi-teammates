import * as fs from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";

export type BuiltinEjectScope = "project" | "user";

export interface BuiltinTeammateDefinition {
	name: string;
	fileName: string;
	filePath: string;
	content: string;
}

export interface EjectBuiltinTeammatesResult {
	scope: BuiltinEjectScope;
	targetDir: string;
	created: string[];
	skipped: string[];
}

export function getBuiltinTeammatesDir(): string {
	return fileURLToPath(new URL("../../examples/teammates", import.meta.url));
}

export function getBuiltinTeammates(): BuiltinTeammateDefinition[] {
	const dir = getBuiltinTeammatesDir();
	if (!isDirectory(dir)) return [];
	return fs.readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
		.map((entry) => {
			const filePath = path.join(dir, entry.name);
			const content = fs.readFileSync(filePath, "utf-8");
			const { frontmatter } = parseFrontmatter<Record<string, unknown>>(content);
			const name = typeof frontmatter.name === "string" ? frontmatter.name.trim() : "";
			return { name, fileName: entry.name, filePath, content };
		})
		.filter((teammate) => teammate.name.length > 0)
		.sort((left, right) => left.name.localeCompare(right.name));
}

export async function ejectBuiltinTeammates(args: {
	cwd: string;
	agentDir?: string;
	scope: BuiltinEjectScope;
	overwrite?: boolean;
}): Promise<EjectBuiltinTeammatesResult> {
	const agentDir = args.agentDir ?? getAgentDir();
	const targetDir = args.scope === "project"
		? findNearestProjectTeammatesDir(args.cwd) ?? path.join(args.cwd, ".pi", "teammates")
		: path.join(agentDir, "teammates");
	await mkdir(targetDir, { recursive: true });

	const created: string[] = [];
	const skipped: string[] = [];
	for (const teammate of getBuiltinTeammates()) {
		const targetPath = path.join(targetDir, teammate.fileName);
		if (!args.overwrite && fs.existsSync(targetPath)) {
			skipped.push(targetPath);
			continue;
		}
		await writeFile(targetPath, teammate.content, "utf-8");
		created.push(targetPath);
	}

	return { scope: args.scope, targetDir, created, skipped };
}

function findNearestProjectTeammatesDir(cwd: string): string | null {
	let currentDir = path.resolve(cwd);
	while (true) {
		const candidate = path.join(currentDir, ".pi", "teammates");
		if (isDirectory(candidate)) return candidate;
		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) return null;
		currentDir = parentDir;
	}
}

function isDirectory(targetPath: string): boolean {
	try {
		return fs.statSync(targetPath).isDirectory();
	} catch {
		return false;
	}
}
