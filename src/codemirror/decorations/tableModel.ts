/**
 * Turns a Lezer `Table` node into the per-table row/column models the widget
 * renders. Reading the parsed tree (not re-splitting the source on `|`) keeps
 * the model aligned with Lezer's boundaries:
 *
 *   - Escaped pipes (`x \| y`) stay inside one `TableCell`.
 *   - Cell inline markdown (`**b**`, `` `c` ``, links) renders via the cell's
 *     inline child nodes (see {@link renderInlineCell}).
 *   - Trailing prose Lezer folds into the table (no blank-line gap) carries no
 *     `TableDelimiter`, so it's dropped rather than rendered as a junk row.
 *   - Tables written with no blank line between them are merged by Lezer into a
 *     single node; each interior delimiter row begins a new table, so one node
 *     can yield several models.
 */

import { type EditorState } from "@codemirror/state";

import { renderInlineCell } from "./tableInline";

type SyntaxNodeLike = {
  readonly name: string;
  readonly from: number;
  readonly to: number;
  readonly firstChild: SyntaxNodeLike | null;
  readonly nextSibling: SyntaxNodeLike | null;
};

export interface TableCellData {
  /** Inline-rendered HTML (sanitised at render time). */
  html: string;
  /** The cell's content range in the document — the span a cell editor edits. */
  from: number;
  to: number;
}

export interface TableData {
  header: TableCellData[];
  rows: TableCellData[][];
  alignments: Array<"left" | "right" | "center" | null>;
}

/** One rendered table plus the document range its source occupies. */
export interface TableModel {
  data: TableData;
  from: number;
  to: number;
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

/**
 * A row's cells in document order, including empty ones. Lezer emits a
 * `TableCell` only for non-empty cells, so an empty cell shows up as two
 * adjacent `TableDelimiter` pipes with nothing between — reconstruct those as
 * empty cells (range = the gap) so blank or freshly inserted rows and columns
 * still render and stay editable. Walking the pipe/cell nodes (rather than
 * splitting on `|`) keeps an escaped pipe (`x \| y`) inside its one cell.
 */
function cells(state: EditorState, row: SyntaxNodeLike): TableCellData[] {
  const out: TableCellData[] = [];
  let lastPipeTo: number | null = null;
  let sawCell = false;
  for (let child = row.firstChild; child; child = child.nextSibling) {
    if (child.name === "TableCell") {
      out.push({ html: renderInlineCell(state, child), from: child.from, to: child.to });
      sawCell = true;
    } else if (child.name === "TableDelimiter") {
      if (lastPipeTo !== null && !sawCell) {
        out.push({ html: "", from: lastPipeTo, to: child.from });
      }
      lastPipeTo = child.to;
      sawCell = false;
    }
  }
  return out;
}

/**
 * A genuine GFM row carries at least one `TableDelimiter` (the `|` pipes).
 * Lezer folds a blank-line-less trailing paragraph into the table as a
 * `TableRow` with a single cell and no delimiter — prose, not a row.
 */
function isContentRow(row: SyntaxNodeLike): boolean {
  for (let child = row.firstChild; child; child = child.nextSibling) {
    if (child.name === "TableDelimiter") return true;
  }
  return false;
}

function alignmentsFrom(state: EditorState, delimiterLine: SyntaxNodeLike): string[] {
  return state
    .sliceDoc(delimiterLine.from, delimiterLine.to)
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((s) => s.trim());
}

function rowCellTexts(state: EditorState, row: SyntaxNodeLike): string[] {
  const cells: string[] = [];
  for (let child = row.firstChild; child; child = child.nextSibling) {
    if (child.name === "TableCell") cells.push(state.sliceDoc(child.from, child.to).trim());
  }
  return cells;
}

/** `| --- | :-: |`: every cell is a dash run with optional alignment colons. */
function isDelimiterCells(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

/**
 * Whether a line is a delimiter (alignment) row. Lezer tags only the FIRST
 * one as a `TableDelimiter` node; the separator of a back-to-back table is a
 * plain `TableRow` whose cells happen to be dash runs, so those are detected by
 * content.
 */
function isDelimiterRow(state: EditorState, node: SyntaxNodeLike): boolean {
  if (node.name === "TableDelimiter") return true;
  return isDelimiterCells(rowCellTexts(state, node));
}

interface Item {
  node: SyntaxNodeLike;
  isDelimiter: boolean;
}

/** The Table node's header/row lines and delimiter lines, in document order. */
function tableItems(state: EditorState, table: SyntaxNodeLike): Item[] {
  const items: Item[] = [];
  for (let child = table.firstChild; child; child = child.nextSibling) {
    if (
      child.name === "TableHeader" ||
      child.name === "TableRow" ||
      child.name === "TableDelimiter"
    ) {
      items.push({ node: child, isDelimiter: isDelimiterRow(state, child) });
    }
  }
  return items;
}

/**
 * Body rows for the table whose delimiter is at `delimiterIndex`: content rows
 * up to the header of the next back-to-back table (the row immediately before
 * the next delimiter), skipping folded-in prose.
 */
function bodyRows(
  state: EditorState,
  items: Item[],
  delimiterIndex: number,
): { rows: TableCellData[][]; to: number } {
  const rows: TableCellData[][] = [];
  let to = items[delimiterIndex].node.to;
  for (let j = delimiterIndex + 1; j < items.length; j++) {
    if (items[j].isDelimiter) break;
    if (items[j + 1]?.isDelimiter) break;
    if (!isContentRow(items[j].node)) continue;
    rows.push(cells(state, items[j].node));
    to = items[j].node.to;
  }
  return { rows, to };
}

export function parseTableNode(state: EditorState, table: SyntaxNodeLike): TableModel[] {
  const items = tableItems(state, table);
  const models: TableModel[] = [];
  for (let k = 0; k < items.length; k++) {
    if (!items[k].isDelimiter) continue;
    const headerItem = items[k - 1];
    if (!headerItem || headerItem.isDelimiter) continue;
    const { rows, to } = bodyRows(state, items, k);
    models.push({
      data: {
        header: cells(state, headerItem.node),
        rows,
        alignments: alignmentsFrom(state, items[k].node).map(alignmentFor),
      },
      from: headerItem.node.from,
      to,
    });
  }
  return models;
}
