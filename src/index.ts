import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCommands } from "./extension/register-commands.ts";
import { registerEvents } from "./extension/register-events.ts";
import { registerTools } from "./extension/register-tools.ts";

export { formatResolvedModelLabel } from "./delegate/model.ts";

export default function teammatesExtension(pi: ExtensionAPI) {
	registerEvents(pi);
	registerCommands(pi);
	registerTools(pi);
}
