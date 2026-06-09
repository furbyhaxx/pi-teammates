export function uniqueBy<T>(values: T[], keyFn: (value: T) => string): T[] {
	const seen = new Set<string>();
	const out: T[] = [];
	for (const value of values) {
		const key = keyFn(value);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(value);
	}
	return out;
}
