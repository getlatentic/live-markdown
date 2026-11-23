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

import { TABLE_WRAP_CLASS } from "./tableWidgetV2";
import { type ChangeDesc, type EditorState } from "@codemirror/state";
import { type EditorView } from "@codemirror/view";

import { cellAt, positionOf } from "../table/tableCellNav";
import { modelAt } from "../table/tableGeometry";

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
  /** The DOM element that hosts typing while an edit is active. */
  editingElement(): HTMLElement | null;
  /** Move the active edit's caret — DOM selection AND the live mirror, so a
   *  bridge key arriving before the async selectionchange reads the truth. */
  placeCaret(offset: number): void;
  /** The current source position of the active edit's table, or null. */
  anchor(): number | null;
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

/** Where the source of a drawn table starts now. The view knows: a table
 *  keeps its element while text above it comes and goes. */
export const tableStart = (view: EditorView, wrap: HTMLElement): number => view.posAtDOM(wrap);

/** The drawn tables of `view`. */
export const tableWraps = (view: EditorView): NodeListOf<HTMLElement> => view.dom.querySelectorAll<HTMLElement>(`.${TABLE_WRAP_CLASS}`);

/** The rendered element for a cell of the table whose source starts at
 *  `tableFrom`. */
export function cellElement(
  view: EditorView,
  tableFrom: number,
  ref: CellRef,
): HTMLElement | null {
  for (const wrap of tableWraps(view)) {
    if (tableStart(view, wrap) !== tableFrom) continue;
    return wrap.querySelector<HTMLElement>(`[data-row="${ref.row}"][data-col="${ref.col}"]`);
  }
  return null;
}

/** The row and column a drawn cell is at. */
export const cellRefOf = (cell: HTMLElement): CellRef => ({ row: Number(cell.dataset.row), col: Number(cell.dataset.col) });

/** Where the source of a drawn cell starts now, or null when its table is
 *  no longer one. */
export function cellStart(view: EditorView, cell: HTMLElement): number | null {
  const wrap = cell.closest<HTMLElement>(`.${TABLE_WRAP_CLASS}`);
  return wrap ? (cellRange(view.state, tableStart(view, wrap), cellRefOf(cell))?.from ?? null) : null;
}

/** The drawn cell whose source starts at `pos`. */
export function cellElementAt(view: EditorView, pos: number): HTMLElement | null {
  const model = modelAt(view.state, pos);
  const ref = model ? positionOf(model, pos) : null;
  return model && ref ? cellElement(view, model.from, ref) : null;
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

/** Caret offset at a viewport point inside `el`, or null when the point
 *  resolves elsewhere (borders, padding gutters). WebKit API. */
export function offsetAtPoint(el: HTMLElement, x: number, y: number): number | null {
  const doc = el.ownerDocument as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const range = doc.caretRangeFromPoint?.(x, y);
  if (!range || !el.contains(range.startContainer)) return null;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

/** Whether the caret sits on the first/last VISUAL line of `el` — a wrapped
 *  cell spans several. Vertical bridge motion only leaves the cell from its
 *  edge lines. Empty or unmeasurable selections count as single-line. */
export function visualEdges(el: HTMLElement): {
  onFirstVisualLine: boolean;
  onLastVisualLine: boolean;
} {
  const single = { onFirstVisualLine: true, onLastVisualLine: true };
  const sel = el.ownerDocument.getSelection();
  if (!sel || sel.rangeCount === 0) return single;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return single;
  const rects = range.getClientRects();
  if (rects.length === 0) return single;
  const caret = rects[0];
  const elRect = el.getBoundingClientRect();
  const line = caret.height || parseFloat(getComputedStyle(el).lineHeight) || 16;
  return {
    onFirstVisualLine: caret.top - elRect.top < line * 0.75,
    onLastVisualLine: elRect.bottom - caret.bottom < line * 0.75,
  };
}
