export const TEAMMATES_LINEAGE_ENV = "PI_TEAMMATES_LINEAGE";

export function parseTeammatesLineage(value: string | undefined): string[] {
	if (!value) return [];
	try {
		const parsed = JSON.parse(value);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((item): item is string => typeof item === "string");
	} catch {
		return [];
	}
}
