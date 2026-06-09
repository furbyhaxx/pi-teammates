import * as path from "node:path";

export function buildChildSessionDir(parentSessionDir: string, parentSessionId: string): string {
	return path.join(parentSessionDir, parentSessionId);
}

export function createJobId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
