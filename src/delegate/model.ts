import type { Model, ThinkingLevel } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { parseContextModelRef } from "../context-transfer.ts";

export function formatResolvedModelLabel(
	model: { provider: string; id: string } | undefined,
	thinkingLevel: ThinkingLevel | "off" | undefined,
): string | undefined {
	if (!model) return undefined;
	return thinkingLevel ? `${model.provider}/${model.id}:${thinkingLevel}` : `${model.provider}/${model.id}`;
}

export function resolveTeammateModel(args: {
	teammateModel: string | undefined;
	modelRegistry: ModelRegistry;
	fallbackModel: Model<any> | undefined;
}): { model: Model<any> | undefined; thinkingLevel: ThinkingLevel | undefined } {
	if (!args.teammateModel || args.teammateModel.trim() === "") {
		return { model: args.fallbackModel, thinkingLevel: undefined };
	}
	const parsed = parseContextModelRef(args.teammateModel, args.fallbackModel?.provider);
	if (!parsed) {
		throw new Error(`Invalid teammate model reference: ${args.teammateModel}`);
	}
	const model = args.modelRegistry.find(parsed.provider, parsed.id);
	if (!model) {
		throw new Error(`Configured teammate model not found: ${parsed.provider}/${parsed.id}`);
	}
	return { model, thinkingLevel: parsed.thinking };
}
