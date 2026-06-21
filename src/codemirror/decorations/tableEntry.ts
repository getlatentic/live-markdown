import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

import { modelAt } from "./tableGeometry";
import { rowCount } from "./tableCellNav";
import { mountTableCellAt } from "./tableCellSubview";

/**
 * Keyboard entry into a table from the surrounding text. The table renders as
 * one atomic block, so the caret normally skips over it; these handlers detect
 * an immediately adjacent table and mount the entry cell's editor instead —
 * ArrowDown from the line just above lands in the top (header) row, ArrowUp from
 * the line just below lands in the bottom row. They return false (so default
 * motion runs) when the next/previous line isn't a table edge, so a blank line
 * between text and table is still a normal stop on the way in.
 */

function enterBelow(view: EditorView): boolean {
  const sel = view.state.selection.main;
  if (!sel.empty) return false;
  const line = view.state.doc.lineAt(sel.head);
  if (line.to >= view.state.doc.length) return false;
  const nextLineStart = line.to + 1;
  const model = modelAt(view.state, nextLineStart);
  if (!model || model.from !== nextLineStart) return false;
  return mountTableCellAt(view, model.from, 0, 0);
}

function enterAbove(view: EditorView): boolean {
  const sel = view.state.selection.main;
  if (!sel.empty || sel.head === 0) return false;
  const line = view.state.doc.lineAt(sel.head);
  if (line.from === 0) return false;
  // Resolve from the previous line's START (inside the table's last row), not
  // its end — its end is the table's `to` boundary, which resolveInner won't map
  // back to the table. The end check confirms that line really is the last row.
  const prevLine = view.state.doc.lineAt(line.from - 1);
  const model = modelAt(view.state, prevLine.from);
  if (!model || model.to !== prevLine.to) return false;
  return mountTableCellAt(view, model.from, rowCount(model) - 1, 0);
}

export const tableEntryKeymap = Prec.high(
  keymap.of([
    { key: "ArrowDown", run: enterBelow },
    { key: "ArrowUp", run: enterAbove },
  ]),
);
