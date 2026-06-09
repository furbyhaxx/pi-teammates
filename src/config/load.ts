import { existsSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir, SettingsManager } from "@earendil-works/pi-coding-agent";
import { _configCache, getSettingsMtimes, mtimesEqual } from "./cache.ts";
import { DEFAULT_TEAMMATES_CONFIG, TEAMMATES_KEYS } from "./defaults.ts";
import { deepMerge, normalizeConfigAliases, pickKnown } from "./merge.ts";
import { sanitizeTeammatesSettings } from "./sanitize.ts";
import type { LoadedTeammatesConfig } from "./types.ts";

export function loadTeammatesConfig(
	cwd: string,
	agentDir = getAgentDir(),
): LoadedTeammatesConfig {
	const currentMtimes = getSettingsMtimes(cwd, agentDir);
	const cacheKey = `${agentDir}::${cwd}`;
	const cached = _configCache.get(cacheKey);
	if (cached && mtimesEqual(cached.mtimes, currentMtimes)) {
		return cached.result;
	}

	const manager = SettingsManager.create(cwd, agentDir);
	const globalSettings = normalizeConfigAliases(manager.getGlobalSettings()) as {
		teammates?: Record<string, unknown>;
	};
	const projectSettings = normalizeConfigAliases(manager.getProjectSettings()) as {
		teammates?: Record<string, unknown>;
	};

	const merged = deepMerge(
		deepMerge(DEFAULT_TEAMMATES_CONFIG, {
			teammates: pickKnown(globalSettings.teammates, TEAMMATES_KEYS),
		}),
		{ teammates: pickKnown(projectSettings.teammates, TEAMMATES_KEYS) },
	);

	const result: LoadedTeammatesConfig = {
		config: {
			teammates: sanitizeTeammatesSettings(merged.teammates),
		},
		sources: settingsSources(cwd, agentDir),
	};
	_configCache.set(cacheKey, { result, mtimes: currentMtimes });
	return result;
}

function settingsSources(cwd: string, agentDir: string): string[] {
	return [join(agentDir, "settings.json"), join(cwd, ".pi", "settings.json")].filter((path) => existsSync(path));
}
