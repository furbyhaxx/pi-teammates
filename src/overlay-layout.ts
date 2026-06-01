import { truncateToWidth, visibleWidth, type OverlayOptions } from "@earendil-works/pi-tui";

interface ColumnSpec {
	min: number;
	ideal: number;
	flex?: boolean;
}

const BORDER_WIDTH = 4;
const COLUMN_GAP = 2;

export function buildResponsiveOverlayOptions(minWidth: number): OverlayOptions {
	return {
		anchor: "center",
		width: "88%",
		minWidth,
		maxHeight: "85%",
		margin: 1,
	};
}

export function getStatusColumnWidths(panelWidth: number): number[] {
	return allocateColumnWidths(panelWidth, [
		{ min: 6, ideal: 8 },
		{ min: 12, ideal: 18 },
		{ min: 8, ideal: 12 },
		{ min: 12, ideal: 18 },
		{ min: 16, ideal: 24, flex: true },
	]);
}

export function getManageColumnWidths(panelWidth: number): number[] {
	return allocateColumnWidths(panelWidth, [
		{ min: 14, ideal: 20 },
		{ min: 8, ideal: 12 },
		{ min: 18, ideal: 34, flex: true },
		{ min: 8, ideal: 8 },
		{ min: 8, ideal: 10 },
	]);
}

export function getVisibleWindow(args: {
	itemCount: number;
	selectedIndex: number;
	maxVisibleItems: number;
}): { start: number; end: number } {
	const itemCount = Math.max(0, args.itemCount);
	if (itemCount === 0) return { start: 0, end: 0 };

	const maxVisibleItems = Math.max(1, Math.min(itemCount, args.maxVisibleItems));
	if (itemCount <= maxVisibleItems) return { start: 0, end: itemCount };

	const selectedIndex = Math.max(0, Math.min(args.selectedIndex, itemCount - 1));
	const halfWindow = Math.floor(maxVisibleItems / 2);
	const start = Math.max(0, Math.min(selectedIndex - halfWindow, itemCount - maxVisibleItems));
	return { start, end: start + maxVisibleItems };
}

export function padToVisibleWidth(value: string, width: number): string {
	const display = truncateToWidth(value, width);
	return display + " ".repeat(Math.max(0, width - visibleWidth(display)));
}

export function padRowsToCount(rows: string[], targetCount: number, fill = ""): string[] {
	if (rows.length >= targetCount) return rows;
	return [...rows, ...Array.from({ length: Math.max(0, targetCount - rows.length) }, () => fill)];
}

export function getLargeModalLayout(args: {
	terminalRows: number;
	chromeRows: number;
	marginRows?: number;
	maxHeightRatio?: number;
}): { overlayRows: number; contentRows: number } {
	const marginRows = args.marginRows ?? 2;
	const maxHeightRatio = args.maxHeightRatio ?? 0.85;
	const maxOverlayRows = Math.max(1, Math.min(Math.floor(args.terminalRows * maxHeightRatio), args.terminalRows - marginRows));
	return {
		overlayRows: maxOverlayRows,
		contentRows: Math.max(0, maxOverlayRows - args.chromeRows),
	};
}

function allocateColumnWidths(panelWidth: number, columns: ColumnSpec[]): number[] {
	const innerWidth = Math.max(1, panelWidth - BORDER_WIDTH);
	const totalGapWidth = COLUMN_GAP * Math.max(0, columns.length - 1);
	const availableContentWidth = Math.max(1, innerWidth - totalGapWidth);
	const widths = columns.map((column) => column.min);
	const minimumWidth = widths.reduce((sum, width) => sum + width, 0);
	if (minimumWidth > availableContentWidth) {
		return shrinkColumnWidths(widths, availableContentWidth);
	}

	let remaining = availableContentWidth - minimumWidth;

	for (let index = 0; index < columns.length && remaining > 0; index++) {
		const column = columns[index]!;
		const growBy = Math.min(remaining, Math.max(0, column.ideal - widths[index]!));
		widths[index]! += growBy;
		remaining -= growBy;
	}

	const flexIndices = columns.flatMap((column, index) => (column.flex ? [index] : []));
	const targetIndices = flexIndices.length > 0 ? flexIndices : [columns.length - 1];
	let cursor = 0;
	while (remaining > 0) {
		const targetIndex = targetIndices[cursor % targetIndices.length]!;
		widths[targetIndex]! += 1;
		remaining -= 1;
		cursor += 1;
	}

	return widths;
}

function shrinkColumnWidths(widths: number[], targetTotalWidth: number): number[] {
	const result = widths.slice();
	let totalWidth = result.reduce((sum, width) => sum + width, 0);

	while (totalWidth > targetTotalWidth) {
		const widestWidth = Math.max(...result);
		const widestIndex = result.findIndex((width) => width === widestWidth && width > 1);
		if (widestIndex === -1) break;
		result[widestIndex]! -= 1;
		totalWidth -= 1;
	}

	return result;
}
