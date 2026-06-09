import { Text } from "@earendil-works/pi-tui";
import type { DelegateParams } from "../types.ts";

export function renderDelegateCall(args: DelegateParams, theme: any): Text {
	const contextSuffix = args.context ? theme.fg("dim", ` [${args.context}]`) : "";
	const title = theme.fg("toolTitle", theme.bold("Delegate"));
	const wrap = (label: string) =>
		title + theme.fg("muted", "(") + theme.fg("accent", label) + theme.fg("muted", ")") + contextSuffix;

	if (args.resumeSessionId) return new Text(wrap(`resume ${args.resumeSessionId}`), 0, 0);
	if (args.chain && args.chain.length > 0) return new Text(wrap(`chain · ${args.chain.length} steps`), 0, 0);
	if (args.tasks && args.tasks.length > 0) return new Text(wrap(`${args.tasks.length} tasks`), 0, 0);
	return new Text(wrap(args.teammate || "…"), 0, 0);
}
