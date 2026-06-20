/**
 * Turns a Lezer `Table` node into the row/column model the widget renders.
 *
 * Reading the parsed tree (not re-splitting the source string on `|`) keeps
 * the model aligned with the boundaries Lezer already decided:
 *
 *   - Escaped pipes (`x \| y`) stay inside one `TableCell` instead of being
 *     split into two columns.
 *   - A trailing prose line that Lezer folds into the `Table` node (a table
 *     not separated from the next paragraph by a blank line) carries no
 *     `TableDelimiter`, so it's dropped instead of rendered as a junk row.
 */

import { type EditorState } from "@codemirror/state";

// Lezer's SyntaxNode type isn't exposed via `@codemirror/language`'s public
// types and `@lezer/common` is only a transitive dep; the structural shape
// used here is small enough to inline (matching deleteNormalizer.ts) rather
// than pull a new direct dependency just for the type.
type SyntaxNodeLike = {
  readonly name: string;
  readonly from: number;
  readonly to: number;
  readonly firstChild: SyntaxNodeLike | null;
  readonly nextSibling: SyntaxNodeLike | null;
};

export interface TableData {
  header: string[];
  rows: string[][];
  alignments: Array<"left" | "right" | "center" | null>;
}

function alignmentFor(spec: string): "left" | "right" | "center" | null {
  const t = spec.trim();
  if (!t) return null;
  const left = t.startsWith(":");
  const right = t.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

function cellTexts(state: EditorState, row: SyntaxNodeLike): string[] {
  const cells: string[] = [];
  for (let child = row.firstChild; child; child = child.nextSibling) {
    if (child.name === "TableCell") {
      cells.push(state.sliceDoc(child.from, child.to).trim());
    }
  }
  return cells;
}

/**
 * A genuine GFM row carries at least one `TableDelimiter` (the `|` pipes).
 * Lezer folds a blank-line-less trailing paragraph into the table as a
 * `TableRow` with a single cell and no delimiter — that line is prose, not a
 * row, so it must not render.
 */
function isContentRow(row: SyntaxNodeLike): boolean {
  for (let child = row.firstChild; child; child = child.nextSibling) {
    if (child.name === "TableDelimiter") return true;
  }
  return false;
}

function alignmentsFrom(state: EditorState, delimiterLine: SyntaxNodeLike | null): string[] {
  if (!delimiterLine) return [];
  return state
    .sliceDoc(delimiterLine.from, delimiterLine.to)
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((s) => s.trim());
}

export function parseTableNode(state: EditorState, table: SyntaxNodeLike): TableData | null {
  let header: SyntaxNodeLike | null = null;
  let delimiterLine: SyntaxNodeLike | null = null;
  const rows: SyntaxNodeLike[] = [];

  for (let child = table.firstChild; child; child = child.nextSibling) {
    if (child.name === "TableHeader") header = child;
    else if (child.name === "TableDelimiter" && !delimiterLine) delimiterLine = child;
    else if (child.name === "TableRow" && isContentRow(child)) rows.push(child);
  }

  if (!header) return null;
  return {
    header: cellTexts(state, header),
    rows: rows.map((r) => cellTexts(state, r)),
    alignments: alignmentsFrom(state, delimiterLine).map(alignmentFor),
  };
}
