import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
	buildResponsiveOverlayOptions,
	getLargeModalLayout,
	getManageColumnWidths,
	getStatusColumnWidths,
	getVisibleWindow,
	padRowsToCount,
	padToVisibleWidth,
} from "../src/overlay-layout.ts";

assert.deepEqual(buildResponsiveOverlayOptions(72), {
	anchor: "center",
	width: "88%",
	minWidth: 72,
	maxHeight: "85%",
	margin: 1,
});

const narrowStatus = getStatusColumnWidths(72);
assert.equal(narrowStatus.length, 5);
assert.equal(narrowStatus.reduce((sum, value) => sum + value, 0) + 8, 68);
assert.ok(narrowStatus[4] >= 16, "task column keeps useful minimum width");

const wideStatus = getStatusColumnWidths(140);
assert.equal(wideStatus.reduce((sum, value) => sum + value, 0) + 8, 136);
assert.ok(wideStatus[4] > narrowStatus[4], "task column grows on wide overlays");

const extraNarrowStatus = getStatusColumnWidths(40);
assert.equal(extraNarrowStatus.reduce((sum, value) => sum + value, 0) + 8, 36);
assert.ok(extraNarrowStatus.every((value) => value >= 1), "status widths stay renderable on very narrow terminals");

const narrowManage = getManageColumnWidths(72);
assert.equal(narrowManage.length, 5);
assert.equal(narrowManage.reduce((sum, value) => sum + value, 0) + 8, 68);
assert.ok(narrowManage[2] >= 18, "model column keeps useful minimum width");

const wideManage = getManageColumnWidths(140);
assert.equal(wideManage.reduce((sum, value) => sum + value, 0) + 8, 136);
assert.ok(wideManage[2] > narrowManage[2], "model column grows on wide overlays");

const extraNarrowManage = getManageColumnWidths(40);
assert.equal(extraNarrowManage.reduce((sum, value) => sum + value, 0) + 8, 36);
assert.ok(extraNarrowManage.every((value) => value >= 1), "manage widths stay renderable on very narrow terminals");

assert.deepEqual(getVisibleWindow({ itemCount: 10, selectedIndex: 0, maxVisibleItems: 4 }), { start: 0, end: 4 });
assert.deepEqual(getVisibleWindow({ itemCount: 10, selectedIndex: 5, maxVisibleItems: 4 }), { start: 3, end: 7 });
assert.deepEqual(getVisibleWindow({ itemCount: 10, selectedIndex: 9, maxVisibleItems: 4 }), { start: 6, end: 10 });

assert.equal(padToVisibleWidth("abc", 6), "abc   ");
assert.equal(visibleWidth(padToVisibleWidth("中文任务", 8)), 8);

assert.deepEqual(getLargeModalLayout({ terminalRows: 45, chromeRows: 7 }), {
	overlayRows: 38,
	contentRows: 31,
});
assert.deepEqual(getLargeModalLayout({ terminalRows: 24, chromeRows: 7 }), {
	overlayRows: 20,
	contentRows: 13,
});
assert.deepEqual(padRowsToCount(["a", "b"], 5), ["a", "b", "", "", ""]);

console.log("overlay layout tests passed");
