/**
 * The swappable cell-editing seam (ADR 0001 §Editing surface).
 *
 * The table model, bridge rules, commands, and menu are identical for both
 * candidate surfaces; only *where typing physically happens* differs:
 *
 *   - inline  (B): the cell `<td>` itself becomes contenteditable.
 *   - overlay (C): one shared editor is positioned over the cell rect,
 *                  portaled outside CodeMirror's DOM.
 *
 * A surface manages at most ONE active edit. It is told about document
 * changes (`mapThrough`) and widget DOM updates (`reanchor`) by the tableV2
 * extension, and resolves the cell's CURRENT source range only at commit
 * time — so edits merge cleanly with concurrent external changes.
 */

import { type ChangeDesc, type EditorState } from "@codemirror/state";
import { type EditorView } from "@codemirror/view";

import { cellAt } from "../decorations/tableCellNav";
import { modelAt } from "../decorations/tableGeometry";

export interface CellRef {
  /** 0 = header row; 1.. = body rows. */
  row: number;
  col: number;
}

export interface ActiveEdit {
  ref: CellRef;
  /** Live unescaped cell text. */
  text: string;
  /** Caret offset within `text`. */
  caret: number;
}

export interface CellEditingSurface {
  readonly kind: "inline" | "overlay";
  /** Begin editing `ref` in the table anchored at `tableFrom` (source start).
   *  Returns false when the cell can't be resolved. */
  begin(view: EditorView, tableFrom: number, ref: CellRef, caret?: number): boolean;
  active(): ActiveEdit | null;
  /** Keep the table anchor position current across document changes. */
  mapThrough(changes: ChangeDesc): void;
  /** Called after the widget DOM was patched or recreated: re-attach the
   *  editing UI, preserving live text, caret, and focus. */
  reanchor(view: EditorView): void;
  /** Resolve the cell's current range and write the live text (if changed);
   *  ends the edit. */
  commit(view: EditorView): void;
  /** End the edit without writing. */
  cancel(): void;
}

/** The rendered element for a cell, resolved through the widget's CURRENT
 *  source-anchor stamp (re-stamped on every toDOM/updateDOM). */
export function cellElement(
  view: EditorView,
  tableFrom: number,
  ref: CellRef,
): HTMLElement | null {
  for (const wrap of view.dom.querySelectorAll<HTMLElement>("[data-tablev2-from]")) {
    if (Number(wrap.dataset.tablev2From) !== tableFrom) continue;
    return wrap.querySelector<HTMLElement>(`[data-row="${ref.row}"][data-col="${ref.col}"]`);
  }
  return null;
}

/** The cell's current source range, from the freshly-parsed model. */
export function cellRange(
  state: EditorState,
  tableFrom: number,
  ref: CellRef,
): { from: number; to: number } | null {
  const model = modelAt(state, tableFrom);
  if (!model) return null;
  const cell = cellAt(model, ref.row, ref.col);
  return cell ? { from: cell.from, to: cell.to } : null;
}

/** Collapse the selection at `offset` within `el` (flat text content). */
export function setCaret(el: HTMLElement, offset: number): void {
  let textNode = el.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
    textNode = el.ownerDocument.createTextNode(el.textContent ?? "");
    el.textContent = "";
    el.appendChild(textNode);
  }
  const max = textNode.textContent?.length ?? 0;
  el.ownerDocument.getSelection()?.collapse(textNode, Math.max(0, Math.min(offset, max)));
}

/** The selection's caret offset within `el`, or null when it's elsewhere. */
export function caretOffset(el: HTMLElement): number | null {
  const sel = el.ownerDocument.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return null;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}
