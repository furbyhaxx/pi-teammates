import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type CommandContext = Parameters<
	NonNullable<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>
>[1];
