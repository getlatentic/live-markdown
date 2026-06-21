import { type EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

import { parseTableNode, type TableModel } from "./tableModel";

/**
 * Position → table geometry: which table a document offset falls in, and the
 * pipe boundaries / column index of a cell. Shared by the structural edit
 * commands and the row/column excerpt builder — both reason about a table from a
 * cell position, so the geometry lives apart from either's specific job.
 */

/** Minimal Lezer node shape — `parseTableNode`'s, plus `parent` for walking up. */
export type LezerNode = {
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
export function modelAt(state: EditorState, pos: number): TableModel | null {
  let node = syntaxTree(state).resolveInner(pos, 0) as unknown as LezerNode | null;
  while (node && node.name !== "Table") node = node.parent;
  if (!node) return null;
  return parseTableNode(state, node).find((m) => pos >= m.from && pos <= m.to) ?? null;
}

/** Absolute positions of the unescaped `|` pipes in `line`. */
export function pipes(state: EditorState, line: { from: number; to: number }): number[] {
  const text = state.doc.sliceString(line.from, line.to);
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "|" && text[i - 1] !== "\\") out.push(line.from + i);
  }
  return out;
}

/** The 0-based column `pos` sits in — the cell after the last pipe before it. */
export function columnAt(state: EditorState, pos: number): number {
  const line = state.doc.lineAt(pos);
  const before = pipes(state, line).filter((p) => p < pos).length;
  return Math.max(0, before - 1);
}
