import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { parseTeammateContextMode, type TeammateContextMode } from "./context-transfer.ts";

export type TeammateSource = "user" | "project";
export type TeammatePromptMode = "append" | "replace";

export interface TeammateConfig {
	name: string;
	description: string;
	tools?: Record<string, boolean>;
	model?: string;
	contextMode: TeammateContextMode;
	promptMode: TeammatePromptMode;
	systemPrompt: string;
	source: TeammateSource;
	filePath: string;
}

export interface TeammateDiscoveryResult {
	teammates: TeammateConfig[];
	projectTeammatesDir: string | null;
}

export interface DiscoverTeammatesOptions {
	agentDir?: string;
	loadProjectTeammates?: boolean;
}

export function parseTeammateMarkdown(
	filePath: string,
	source: TeammateSource,
	content: string,
): TeammateConfig {
	const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(content);
	const name = typeof frontmatter.name === "string" ? frontmatter.name.trim() : "";
	const description =
		typeof frontmatter.description === "string" ? frontmatter.description.trim() : "";
	if (!name || !description) {
		throw new Error(`Invalid teammate file ${filePath}: missing name or description`);
	}

	return {
		name,
		description,
		tools: parseToolToggles(frontmatter.tools),
		model: typeof frontmatter.model === "string" ? frontmatter.model.trim() || undefined : undefined,
		contextMode: parseTeammateContextMode(frontmatter.context),
		promptMode: frontmatter.prompt === "replace" ? "replace" : "append",
		systemPrompt: body,
		source,
		filePath,
	};
}

export function discoverTeammates(
	cwd: string,
	options: DiscoverTeammatesOptions = {},
): TeammateDiscoveryResult {
	const agentDir = options.agentDir ?? getAgentDir();
	const loadProjectTeammates = options.loadProjectTeammates ?? true;
	const userDir = path.join(agentDir, "teammates");
	const projectTeammatesDir = findNearestProjectTeammatesDir(cwd);

	const teammateMap = new Map<string, TeammateConfig>();
	for (const teammate of loadTeammatesFromDir(userDir, "user")) {
		teammateMap.set(teammate.name, teammate);
	}
	if (loadProjectTeammates && projectTeammatesDir) {
		for (const teammate of loadTeammatesFromDir(projectTeammatesDir, "project")) {
			teammateMap.set(teammate.name, teammate);
		}
	}

	return {
		teammates: Array.from(teammateMap.values()).sort((left, right) => left.name.localeCompare(right.name)),
		projectTeammatesDir,
	};
}

export function findNearestProjectTeammatesDir(cwd: string): string | null {
	let currentDir = path.resolve(cwd);
	while (true) {
		const candidate = path.join(currentDir, ".pi", "teammates");
		if (isDirectory(candidate)) return candidate;
		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) return null;
		currentDir = parentDir;
	}
}

function loadTeammatesFromDir(dir: string, source: TeammateSource): TeammateConfig[] {
	if (!isDirectory(dir)) return [];
	const teammates: TeammateConfig[] = [];
	for (const filePath of collectMarkdownFiles(dir)) {
		try {
			const content = fs.readFileSync(filePath, "utf-8");
			teammates.push(parseTeammateMarkdown(filePath, source, content));
		} catch {
			// Ignore invalid or unreadable teammate definitions.
		}
	}
	return teammates;
}

function collectMarkdownFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const filePath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectMarkdownFiles(filePath));
			continue;
		}
		if ((entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith(".md")) {
			files.push(filePath);
		}
	}
	files.sort((left, right) => left.localeCompare(right));
	return files;
}

function parseToolToggles(value: unknown): Record<string, boolean> | undefined {
	if (!isPlainObject(value)) return undefined;
	const toggles: Record<string, boolean> = {};
	for (const [toolName, enabled] of Object.entries(value)) {
		if (typeof enabled === "boolean") toggles[toolName] = enabled;
	}
	return Object.keys(toggles).length > 0 ? toggles : undefined;
}

function isDirectory(targetPath: string): boolean {
	try {
		return fs.statSync(targetPath).isDirectory();
	} catch {
		return false;
	}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
