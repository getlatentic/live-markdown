/**
 * The bridge's key decisions (ADR 0001): given where the caret sits inside a
 * cell, either the browser handles the key natively (mid-text editing) or the
 * bridge takes over at a boundary — stepping to a neighbour cell or exiting
 * the table. Pure — the grid math delegates to {@link stepCell}; geometry
 * (wrapped-line detection) arrives as booleans computed by the surface.
 *
 * Structural invariant: no key ever merges cells or rows. Backspace/Delete at
 * a cell edge NAVIGATES; structure changes only happen through explicit
 * commands (tableEditCommands).
 */

import { type NavDir, type NavTarget, rowCount, stepGrid } from "../decorations/tableCellNav";
import { type TableModel } from "../decorations/tableModel";

export type BridgeKey =
  | "Tab"
  | "Shift-Tab"
  | "ArrowRight"
  | "ArrowLeft"
  | "ArrowUp"
  | "ArrowDown"
  | "Backspace"
  | "Delete"
  | "Enter";

export interface BridgeInput {
  /** Grid dimensions: rows includes the header. */
  rows: number;
  cols: number;
  /** Caret cell (row 0 = header) and text position. */
  row: number;
  col: number;
  offset: number;
  length: number;
  /** Real-geometry flags from the surface (wrapped cells). */
  onFirstVisualLine: boolean;
  onLastVisualLine: boolean;
}

export type BridgeAction =
  | { kind: "native" }
  | { kind: "focusCell"; row: number; col: number; caret: "start" | "end" }
  | { kind: "exit"; edge: "before" | "after" };

const NATIVE: BridgeAction = { kind: "native" };

/** Dimensions of `model` as BridgeInput expects them. */
export function gridSize(model: TableModel): { rows: number; cols: number } {
  return { rows: rowCount(model), cols: model.data.header.length };
}

function resolve(input: BridgeInput, dir: NavDir, caret: "start" | "end"): BridgeAction {
  const target: NavTarget = stepGrid(input.rows, input.cols, input.row, input.col, dir);
  if (target.kind === "cell") return { kind: "focusCell", row: target.row, col: target.col, caret };
  return { kind: "exit", edge: target.edge === "above" || target.edge === "before" ? "before" : "after" };
}

export function bridgeKey(input: BridgeInput, key: BridgeKey): BridgeAction {
  const atStart = input.offset === 0;
  const atEnd = input.offset >= input.length;
  switch (key) {
    case "Tab":
      return resolve(input, "next", "start");
    case "Shift-Tab":
      return resolve(input, "prev", "end");
    case "ArrowRight":
      return atEnd ? resolve(input, "next", "start") : NATIVE;
    case "ArrowLeft":
      return atStart ? resolve(input, "prev", "end") : NATIVE;
    case "ArrowDown":
      return input.onLastVisualLine ? resolve(input, "down", "start") : NATIVE;
    case "ArrowUp":
      return input.onFirstVisualLine ? resolve(input, "up", "start") : NATIVE;
    case "Backspace":
      return atStart ? resolve(input, "prev", "end") : NATIVE;
    case "Delete":
      return atEnd ? resolve(input, "next", "start") : NATIVE;
    case "Enter":
      return resolve(input, "down", "start");
    default:
      return NATIVE;
  }
}
