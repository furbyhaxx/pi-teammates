import { readFile } from "node:fs/promises";
import type { Skill } from "@earendil-works/pi-coding-agent";

export interface ResolvedTeammateSkills {
	prompt: string;
	missing: string[];
}

export async function buildInjectedSkillsPrompt(args: {
	skillNames: string[];
	availableSkills: Skill[];
}): Promise<ResolvedTeammateSkills> {
	if (args.skillNames.length === 0) {
		return { prompt: "", missing: [] };
	}

	const skillsByName = new Map(args.availableSkills.map((skill) => [skill.name, skill]));
	const missing: string[] = [];
	const loadedBlocks: string[] = [];

	for (const skillName of args.skillNames) {
		const skill = skillsByName.get(skillName);
		if (!skill) {
			missing.push(skillName);
			continue;
		}
		const content = await readFile(skill.filePath, "utf-8");
		loadedBlocks.push([
			`<skill name="${escapeXml(skill.name)}" path="${escapeXml(skill.filePath)}">`,
			content.trim(),
			"</skill>",
		].join("\n"));
	}

	if (loadedBlocks.length === 0) {
		return { prompt: "", missing };
	}

	return {
		prompt: [
			"The following skills are already loaded for this teammate invocation. Treat them as active instructions and follow them without requiring an explicit /skill command.",
			"<loaded_skills>",
			...loadedBlocks,
			"</loaded_skills>",
		].join("\n\n"),
		missing,
	};
}

function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}
