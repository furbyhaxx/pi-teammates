import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerDelegateTool } from "../delegate/tool-definition.ts";

export function registerTools(pi: ExtensionAPI): void {
	registerDelegateTool(pi);
}
