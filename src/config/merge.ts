import type { DeepPartial } from "./types.ts";

export function deepMerge<T>(base: T, override: DeepPartial<T> | undefined): T {
	if (override === undefined) return clone(base);
	if (!isPlainObject(base) || !isPlainObject(override)) {
		return clone(override as T);
	}

	const merged: Record<string, unknown> = {
		...(base as Record<string, unknown>),
	};
	for (const [key, value] of Object.entries(override)) {
		if (value === undefined) continue;
		const current = merged[key];
		if (isPlainObject(current) && isPlainObject(value)) {
			merged[key] = deepMerge(current, value as Record<string, unknown>);
		} else {
			merged[key] = clone(value);
		}
	}
	return merged as T;
}

export function pickKnown(value: unknown, keys: readonly string[]): Record<string, unknown> {
	if (!isPlainObject(value)) return {};
	const out: Record<string, unknown> = {};
	for (const key of keys) {
		if (Object.hasOwn(value, key)) out[key] = value[key];
	}
	return out;
}

export function normalizeConfigAliases(value: unknown): unknown {
	if (Array.isArray(value)) return value.map((item) => normalizeConfigAliases(item));
	if (!isPlainObject(value)) return value;

	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [
			snakeToCamel(key),
			normalizeConfigAliases(item),
		]),
	);
}

function snakeToCamel(key: string): string {
	return key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function clone<T>(value: T): T {
	if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
	if (isPlainObject(value)) {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [key, clone(item)]),
		) as T;
	}
	return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
