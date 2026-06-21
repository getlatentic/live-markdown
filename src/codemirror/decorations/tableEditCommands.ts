import { type ChangeSpec, type EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

import { parseTableNode, type TableModel } from "./tableModel";

/**
 * Structural table edits — add/remove rows (columns land next) — as pure
 * `ChangeSpec` builders computed from the Lezer tree, never from the rendered
 * DOM. Each takes the document position the action targets (a cell the cursor or
 * a control sits in) and returns the change, or null when `pos` isn't in a table.
 * The rebuilt table widget re-renders from the new source, so there's nothing to
 * keep in sync.
 */

/** Minimal Lezer node shape — parseTableNode's, plus `parent` for walking up. */
type LezerNode = {
  readonly name: string;
  readonly from: number;
  readonly to: number;
  readonly firstChild: LezerNode | null;
  readonly nextSibling: LezerNode | null;
  readonly parent: LezerNode | null;
};

/**
 * The table model whose source range encloses `pos`, or null. Resolves the
 * enclosing `Table` node, then — since Lezer merges blank-line-less tables into
 * one node — picks the back-to-back sub-table that actually contains `pos`.
 */
function modelAt(state: EditorState, pos: number): TableModel | null {
  let node = syntaxTree(state).resolveInner(pos, 0) as unknown as LezerNode | null;
  while (node && node.name !== "Table") node = node.parent;
  if (!node) return null;
  return parseTableNode(state, node).find((m) => pos >= m.from && pos <= m.to) ?? null;
}

/** An empty body row with `columns` cells: `|  |  | … |`. */
function emptyRow(columns: number): string {
  return "|" + "  |".repeat(columns);
}

/** The header + delimiter lines of `model` (the delimiter is the line after the
 *  header). */
function frame(state: EditorState, model: TableModel) {
  const header = state.doc.lineAt(model.from);
  return { header, delimiter: state.doc.lineAt(header.to + 1) };
}

/**
 * Insert an empty row below the row at `pos`. From the header or delimiter the
 * new row becomes the first body row (right after the delimiter).
 */
export function addRowBelow(state: EditorState, pos: number): ChangeSpec | null {
  const model = modelAt(state, pos);
  if (!model) return null;
  const { delimiter } = frame(state, model);
  const current = state.doc.lineAt(pos);
  const after = current.from <= delimiter.from ? delimiter : current;
  return { from: after.to, insert: "\n" + emptyRow(model.data.header.length) };
}

/**
 * Insert an empty row above the body row at `pos`. From the header or delimiter
 * it inserts as the first body row.
 */
export function addRowAbove(state: EditorState, pos: number): ChangeSpec | null {
  const model = modelAt(state, pos);
  if (!model) return null;
  const { delimiter } = frame(state, model);
  const current = state.doc.lineAt(pos);
  const row = emptyRow(model.data.header.length);
  if (current.from <= delimiter.from) {
    return { from: delimiter.to, insert: "\n" + row };
  }
  return { from: current.from, insert: row + "\n" };
}

/**
 * Delete the body row at `pos`. A no-op on the header or delimiter (those define
 * the table); deleting the last body row is allowed and leaves an empty-bodied
 * table.
 */
export function deleteRow(state: EditorState, pos: number): ChangeSpec | null {
  const model = modelAt(state, pos);
  if (!model) return null;
  const { delimiter } = frame(state, model);
  const current = state.doc.lineAt(pos);
  if (current.from <= delimiter.from) return null;
  // Take the line and the newline that precedes it, joining its neighbours.
  return { from: current.from - 1, to: current.to };
}

/** Absolute positions of the unescaped `|` pipes in `line`. */
function pipes(state: EditorState, line: { from: number; to: number }): number[] {
  const text = state.doc.sliceString(line.from, line.to);
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "|" && text[i - 1] !== "\\") out.push(line.from + i);
  }
  return out;
}

/** The 0-based column `pos` sits in — the cell after the last pipe before it. */
function columnAt(state: EditorState, pos: number): number {
  const line = state.doc.lineAt(pos);
  const before = pipes(state, line).filter((p) => p < pos).length;
  return Math.max(0, before - 1);
}

/**
 * Insert an empty column at the pipe boundary `offset` past the cursor's column
 * (1 = to its right, 0 = to its left), in every row. The delimiter row gets a
 * `---` cell, content rows an empty one.
 */
function insertColumn(state: EditorState, pos: number, offset: 0 | 1): ChangeSpec | null {
  const model = modelAt(state, pos);
  if (!model) return null;
  const boundary = columnAt(state, pos) + offset;
  const start = state.doc.lineAt(model.from).number;
  const end = state.doc.lineAt(model.to).number;
  const changes: ChangeSpec[] = [];
  for (let n = start; n <= end; n++) {
    const line = state.doc.line(n);
    const p = pipes(state, line);
    if (boundary < p.length) {
      changes.push({ from: p[boundary] + 1, insert: n === start + 1 ? " --- |" : "  |" });
    }
  }
  return changes.length ? changes : null;
}

/** Insert an empty column to the right of the cursor's column. */
export function addColumnAfter(state: EditorState, pos: number): ChangeSpec | null {
  return insertColumn(state, pos, 1);
}

/** Insert an empty column to the left of the cursor's column. */
export function addColumnBefore(state: EditorState, pos: number): ChangeSpec | null {
  return insertColumn(state, pos, 0);
}

/** Delete the cursor's column from every row. No-op on a single-column table. */
export function deleteColumn(state: EditorState, pos: number): ChangeSpec | null {
  const model = modelAt(state, pos);
  if (!model || model.data.header.length <= 1) return null;
  const col = columnAt(state, pos);
  const start = state.doc.lineAt(model.from).number;
  const end = state.doc.lineAt(model.to).number;
  const changes: ChangeSpec[] = [];
  for (let n = start; n <= end; n++) {
    const p = pipes(state, state.doc.line(n));
    if (col + 1 < p.length) changes.push({ from: p[col], to: p[col + 1] });
  }
  return changes.length ? changes : null;
}
