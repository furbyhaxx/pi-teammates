import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { parseTeammateContextMode } from "../context/modes.ts";
import type { TeammateConfig, TeammateSource } from "./types.ts";

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
	if (!/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(name)) {
		throw new Error(`Invalid teammate file ${filePath}: teammate names must use letters, numbers, and hyphens only`);
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
