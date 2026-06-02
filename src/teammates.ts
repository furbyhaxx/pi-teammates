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
	skills: string[];
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
	/** Paths of teammate files that failed to parse, with error messages. */
	warnings: string[];
}

export interface DiscoverTeammatesOptions {
	agentDir?: string;
	loadProjectTeammates?: boolean;
}

// ─── mtime-based discovery cache ─────────────────────────────────────────────

interface TeammatesCacheEntry {
	result: TeammateDiscoveryResult;
	pathMtimes: Record<string, number>;
}
const _teammatesCache = new Map<string, TeammatesCacheEntry>();

function getPathMtime(p: string): number {
	try {
		return fs.statSync(p).mtimeMs;
	} catch {
		return 0;
	}
}

function collectDirMtimes(dir: string): Record<string, number> {
	const mtimes: Record<string, number> = {};
	mtimes[dir] = getPathMtime(dir);
	if (!isDirectory(dir)) return mtimes;
	try {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const p = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				Object.assign(mtimes, collectDirMtimes(p));
			} else {
				mtimes[p] = getPathMtime(p);
			}
		}
	} catch {
		// ignore unreadable directories
	}
	return mtimes;
}

function mtimesEqual(a: Record<string, number>, b: Record<string, number>): boolean {
	const keysA = Object.keys(a);
	if (keysA.length !== Object.keys(b).length) return false;
	return keysA.every((k) => a[k] === b[k]);
}

// ─────────────────────────────────────────────────────────────────────────────

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
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
		throw new Error(`Invalid teammate file ${filePath}: teammate names must use lowercase letters, numbers, and hyphens only`);
	}

	return {
		name,
		description,
		tools: parseToolToggles(frontmatter.tools),
		skills: parseSkillNames(frontmatter.skills),
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

	const cacheKey = `${agentDir}::${projectTeammatesDir ?? ""}::${loadProjectTeammates}`;
	const currentMtimes: Record<string, number> = {
		...collectDirMtimes(userDir),
		...(loadProjectTeammates && projectTeammatesDir ? collectDirMtimes(projectTeammatesDir) : {}),
	};
	const cached = _teammatesCache.get(cacheKey);
	if (cached && mtimesEqual(cached.pathMtimes, currentMtimes)) {
		return cached.result;
	}

	const warnings: string[] = [];
	const teammateMap = new Map<string, TeammateConfig>();

	const userResult = loadTeammatesFromDir(userDir, "user");
	warnings.push(...userResult.warnings);
	for (const teammate of userResult.teammates) {
		teammateMap.set(teammate.name, teammate);
	}
	if (loadProjectTeammates && projectTeammatesDir) {
		const projectResult = loadTeammatesFromDir(projectTeammatesDir, "project");
		warnings.push(...projectResult.warnings);
		for (const teammate of projectResult.teammates) {
			teammateMap.set(teammate.name, teammate);
		}
	}

	const result: TeammateDiscoveryResult = {
		teammates: Array.from(teammateMap.values()).sort((left, right) => left.name.localeCompare(right.name)),
		projectTeammatesDir,
		warnings,
	};
	_teammatesCache.set(cacheKey, { result, pathMtimes: currentMtimes });
	return result;
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

function loadTeammatesFromDir(
	dir: string,
	source: TeammateSource,
): { teammates: TeammateConfig[]; warnings: string[] } {
	if (!isDirectory(dir)) return { teammates: [], warnings: [] };
	const teammates: TeammateConfig[] = [];
	const warnings: string[] = [];
	for (const filePath of collectMarkdownFiles(dir)) {
		try {
			const content = fs.readFileSync(filePath, "utf-8");
			teammates.push(parseTeammateMarkdown(filePath, source, content));
		} catch (error) {
			warnings.push(`${path.basename(filePath)}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	return { teammates, warnings };
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

function parseSkillNames(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((skill): skill is string => typeof skill === "string")
		.map((skill) => skill.trim())
		.filter((skill) => skill.length > 0);
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
