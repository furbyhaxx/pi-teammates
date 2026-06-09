import { statSync } from "node:fs";
import { join } from "node:path";
import type { LoadedTeammatesConfig } from "./types.ts";

interface ConfigCacheEntry {
	result: LoadedTeammatesConfig;
	mtimes: Record<string, number>;
}

export const _configCache = new Map<string, ConfigCacheEntry>();

export function getSettingsMtimes(cwd: string, agentDir: string): Record<string, number> {
	const paths = [join(agentDir, "settings.json"), join(cwd, ".pi", "settings.json")];
	const mtimes: Record<string, number> = {};
	for (const p of paths) {
		try {
			mtimes[p] = statSync(p).mtimeMs;
		} catch {
			mtimes[p] = 0;
		}
	}
	return mtimes;
}

export function mtimesEqual(a: Record<string, number>, b: Record<string, number>): boolean {
	const keysA = Object.keys(a);
	if (keysA.length !== Object.keys(b).length) return false;
	return keysA.every((k) => a[k] === b[k]);
}
