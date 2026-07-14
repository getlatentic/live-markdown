import { type TableModel } from "./tableModel";

/**
 * Pure geometry for moving the caret between table cells. A table is rendered as
 * one atomic block whose cells are edited in per-cell subviews; navigation maps
 * a (row, col) + direction to the next cell or to an exit out of the table. Row 0
 * is the header; the `| --- |` delimiter row is not navigable. Kept pure (no
 * EditorView) so the step math is unit-testable; mounting lives in
 * {@link mountCellSubview}.
 */

/** Navigable rows: the header plus every body row. */
export function rowCount(model: TableModel): number {
  return 1 + model.data.rows.length;
}

/** The cell at (row, col) — row 0 is the header — or null when out of range. */
export function cellAt(model: TableModel, row: number, col: number) {
  const cells = row === 0 ? model.data.header : model.data.rows[row - 1];
  return cells?.[col] ?? null;
}

/** The (row, col) of the cell whose source starts at `from`, or null. */
export function positionOf(model: TableModel, from: number): { row: number; col: number } | null {
  for (let row = 0; row < rowCount(model); row++) {
    const cells = row === 0 ? model.data.header : model.data.rows[row - 1];
    const col = cells.findIndex((cell) => cell.from === from);
    if (col >= 0) return { row, col };
  }
  return null;
}

export type NavDir = "next" | "prev" | "up" | "down";
export type ExitEdge = "above" | "below" | "before" | "after";
export type NavTarget =
  | { kind: "cell"; row: number; col: number }
  | { kind: "exit"; edge: ExitEdge };

/**
 * Where `dir` moves from (row, col): an adjacent cell, or an exit edge when it
 * leaves the table. `next`/`prev` (Tab / shift-Tab, or Left/Right at a cell's
 * text edge) wrap across rows in reading order; `up`/`down` stay in the column.
 */
export function stepCell(model: TableModel, row: number, col: number, dir: NavDir): NavTarget {
  return stepGrid(rowCount(model), model.data.header.length, row, col, dir);
}

/** {@link stepCell} on bare grid dimensions — the tablev2 bridge has the
 *  dimensions but no model object. Single home for the step math. */
export function stepGrid(
  rows: number,
  cols: number,
  row: number,
  col: number,
  dir: NavDir,
): NavTarget {
  switch (dir) {
    case "next":
      if (col + 1 < cols) return { kind: "cell", row, col: col + 1 };
      if (row + 1 < rows) return { kind: "cell", row: row + 1, col: 0 };
      return { kind: "exit", edge: "after" };
    case "prev":
      if (col > 0) return { kind: "cell", row, col: col - 1 };
      if (row > 0) return { kind: "cell", row: row - 1, col: cols - 1 };
      return { kind: "exit", edge: "before" };
    case "down":
      return row + 1 < rows ? { kind: "cell", row: row + 1, col } : { kind: "exit", edge: "below" };
    case "up":
      return row > 0 ? { kind: "cell", row: row - 1, col } : { kind: "exit", edge: "above" };
  }
}

/**
 * Where the caret lands when leaving the table at `edge`. The table is one atomic
 * block spanning [from, to]: a caret at `from` is shoved forward past the whole
 * block by CodeMirror, and a caret at `to` stays on the block's last (hidden) row
 * — either boundary keeps the caret on the grid, so a stray arrow press is then
 * needed to clear it. Stepping one position outward reaches the real neighbouring
 * line: `from - 1` ends the line above, `to + 1` starts the line below (the blank
 * line a GFM table is separated by). Both are clamped to the document.
 */
export function exitCaretPos(edge: ExitEdge, from: number, to: number, docLength: number): number {
  return edge === "above" || edge === "before"
    ? Math.max(0, from - 1)
    : Math.min(to + 1, docLength);
}
