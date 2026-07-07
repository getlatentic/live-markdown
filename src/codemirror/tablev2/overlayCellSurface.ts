/**
 * Surface C — one shared editor floated over the cell (ADR 0001 §Editing
 * surface; the spreadsheet model).
 *
 * The widget stays pure render. `begin` positions a plaintext-only editor
 * over the cell's rect, portaled to `document.body` — OUTSIDE CodeMirror's
 * DOM — so widget patches and full recreates cannot touch the edit state:
 * `reanchor` only repositions. Styling is copied from the cell so the overlay
 * reads as editing-in-place.
 */

import { type ChangeDesc } from "@codemirror/state";
import { type EditorView } from "@codemirror/view";

import {
  type ActiveEdit,
  type CellEditingSurface,
  type CellRef,
  caretOffset,
  cellElement,
  cellRange,
  setCaret,
} from "./cellEditingSurface";
import { escapePipes, unescapePipes } from "./cellText";

interface EditState {
  tableFrom: number;
  ref: CellRef;
  overlay: HTMLElement;
  text: string;
  caret: number;
  original: string;
}

export class OverlayCellSurface implements CellEditingSurface {
  readonly kind = "overlay" as const;
  private edit: EditState | null = null;

  private readonly onInput = (): void => {
    const s = this.edit;
    if (!s) return;
    s.text = s.overlay.textContent ?? "";
    s.caret = caretOffset(s.overlay) ?? s.text.length;
  };

  private readonly onSelectionChange = (): void => {
    const s = this.edit;
    if (!s) return;
    const offset = caretOffset(s.overlay);
    if (offset !== null) s.caret = offset;
  };

  begin(view: EditorView, tableFrom: number, ref: CellRef, caret = 0): boolean {
    this.cancel();
    const anchor = cellElement(view, tableFrom, ref);
    const range = cellRange(view.state, tableFrom, ref);
    if (!anchor || !range) return false;
    const text = unescapePipes(view.state.sliceDoc(range.from, range.to));

    const overlay = anchor.ownerDocument.createElement("div");
    overlay.className = "cm-tablev2-overlay";
    overlay.setAttribute("contenteditable", "plaintext-only");
    const style = getComputedStyle(anchor);
    Object.assign(overlay.style, {
      position: "fixed",
      font: style.font,
      lineHeight: style.lineHeight,
      padding: style.padding,
      color: style.color,
      textAlign: style.textAlign,
      boxSizing: "border-box",
      background: "var(--cds-layer-01, #ffffff)",
      outline: "2px solid var(--cds-focus, #0f62fe)",
      outlineOffset: "-2px",
      zIndex: "30",
      overflowWrap: "break-word",
    });
    overlay.textContent = text;
    anchor.ownerDocument.body.appendChild(overlay);
    this.edit = { tableFrom, ref, overlay, text, caret: Math.min(caret, text.length), original: text };
    this.position(anchor);
    overlay.addEventListener("input", this.onInput);
    overlay.ownerDocument.addEventListener("selectionchange", this.onSelectionChange);
    overlay.focus();
    setCaret(overlay, this.edit.caret);
    return true;
  }

  active(): ActiveEdit | null {
    const s = this.edit;
    return s ? { ref: s.ref, text: s.text, caret: s.caret } : null;
  }

  mapThrough(changes: ChangeDesc): void {
    if (this.edit) this.edit.tableFrom = changes.mapPos(this.edit.tableFrom);
  }

  reanchor(view: EditorView): void {
    const s = this.edit;
    if (!s) return;
    const anchor = cellElement(view, s.tableFrom, s.ref);
    // Text, caret, and focus live outside the widget — geometry is the only
    // thing to refresh.
    if (anchor) this.position(anchor);
  }

  commit(view: EditorView): void {
    const s = this.edit;
    if (!s) return;
    const range = cellRange(view.state, s.tableFrom, s.ref);
    this.teardown();
    if (!range || s.text === s.original) return;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: escapePipes(s.text) },
      userEvent: "input.table.cell",
    });
  }

  cancel(): void {
    if (this.edit) this.teardown();
  }

  private position(anchor: HTMLElement): void {
    const s = this.edit;
    if (!s) return;
    const rect = anchor.getBoundingClientRect();
    Object.assign(s.overlay.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      minWidth: `${rect.width}px`,
      minHeight: `${rect.height}px`,
    });
  }

  private teardown(): void {
    const s = this.edit;
    if (!s) return;
    s.overlay.removeEventListener("input", this.onInput);
    s.overlay.ownerDocument.removeEventListener("selectionchange", this.onSelectionChange);
    s.overlay.remove();
    this.edit = null;
  }
}
