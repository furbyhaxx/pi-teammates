import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { getBuiltinTeammates, getBuiltinTeammatesDir } from "./builtins.ts";
import { parseTeammateMarkdown } from "./parse.ts";
import type {
	DiscoverTeammatesOptions,
	TeammateConfig,
	TeammateDiscoveryResult,
	TeammateSource,
} from "./types.ts";

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
		...collectDirMtimes(getBuiltinTeammatesDir()),
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
	let scopedFileCount = userResult.fileCount;
	if (loadProjectTeammates && projectTeammatesDir) {
		const projectResult = loadTeammatesFromDir(projectTeammatesDir, "project");
		warnings.push(...projectResult.warnings);
		scopedFileCount += projectResult.fileCount;
		for (const teammate of projectResult.teammates) {
			teammateMap.set(teammate.name, teammate);
		}
	}

	let usingBuiltins = false;
	if (scopedFileCount === 0 && teammateMap.size === 0) {
		usingBuiltins = true;
		for (const builtin of getBuiltinTeammates()) {
			teammateMap.set(builtin.name, parseTeammateMarkdown(builtin.filePath, "builtin", builtin.content));
		}
	}

	const result: TeammateDiscoveryResult = {
		teammates: Array.from(teammateMap.values()).sort((left, right) => left.name.localeCompare(right.name)),
		projectTeammatesDir,
		usingBuiltins,
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
): { teammates: TeammateConfig[]; warnings: string[]; fileCount: number } {
	if (!isDirectory(dir)) return { teammates: [], warnings: [], fileCount: 0 };
	const teammates: TeammateConfig[] = [];
	const warnings: string[] = [];
	const filePaths = collectMarkdownFiles(dir);
	for (const filePath of filePaths) {
		try {
			const content = fs.readFileSync(filePath, "utf-8");
			teammates.push(parseTeammateMarkdown(filePath, source, content));
		} catch (error) {
			warnings.push(`${path.basename(filePath)}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	return { teammates, warnings, fileCount: filePaths.length };
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

function isDirectory(targetPath: string): boolean {
	try {
		return fs.statSync(targetPath).isDirectory();
	} catch {
		return false;
	}
}
