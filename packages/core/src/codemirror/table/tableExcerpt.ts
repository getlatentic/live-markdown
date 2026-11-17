import { type EditorState } from "@codemirror/state";

import { type SourceRange } from "../../types";
import { byteRangeOf } from "../byteOffset";
import { columnAt, modelAt, pipes } from "./tableGeometry";

/**
 * Pull a table row or column out as a self-contained markdown table fragment,
 * paired with the source range it came from. Drives the table context menu's
 * "Ask the assistant about this row/column": the fragment is the quoted excerpt
 * the assistant sees, the range anchors the chat's source chip.
 */
export interface TableExcerpt {
  text: string;
  range: SourceRange;
}

/** Source text of column `col` on table line `lineNumber` (between its pipes),
 *  trimmed; empty string when the line has no such cell. */
function cellText(state: EditorState, lineNumber: number, col: number): string {
  const line = state.doc.line(lineNumber);
  const ps = pipes(state, line);
  if (col + 1 >= ps.length) return "";
  return state.sliceDoc(ps[col] + 1, ps[col + 1]).trim();
}

/**
 * The row at `pos` as a standalone table — the header and delimiter lines plus
 * this row, verbatim — so the assistant receives valid, self-describing markdown.
 * Right-clicking the header row yields just the header. Range = the clicked row's
 * line. Null when `pos` isn't in a table.
 */
export function rowExcerptAt(state: EditorState, pos: number): TableExcerpt | null {
  const model = modelAt(state, pos);
  if (!model) return null;
  const header = state.doc.lineAt(model.from);
  const row = state.doc.lineAt(pos);
  const lines =
    row.from <= header.to
      ? [header.text]
      : [header.text, state.doc.line(header.number + 1).text, row.text];
  return { text: lines.join("\n"), range: byteRangeOf(state, row.from, row.to) };
}

/**
 * The column at `pos` as a one-column table — its header cell, a delimiter, and
 * the cell from every body row. Range = the whole table (a column's source is
 * non-contiguous, so the chip anchors to the table). Null when `pos` isn't in a
 * table.
 */
export function columnExcerptAt(state: EditorState, pos: number): TableExcerpt | null {
  const model = modelAt(state, pos);
  if (!model) return null;
  const col = columnAt(state, pos);
  const headerLine = state.doc.lineAt(model.from).number;
  const lastLine = state.doc.lineAt(model.to).number;
  const lines = [`| ${cellText(state, headerLine, col)} |`, "| --- |"];
  for (let n = headerLine + 2; n <= lastLine; n++) {
    lines.push(`| ${cellText(state, n, col)} |`);
  }
  return { text: lines.join("\n"), range: byteRangeOf(state, model.from, model.to) };
}
