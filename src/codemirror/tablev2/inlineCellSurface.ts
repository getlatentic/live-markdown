/**
 * Surface B — the cell `<td>` itself edits (ADR 0001 §Editing surface).
 *
 * `begin` swaps the rendered cell content for the raw text and flips the cell
 * to `contenteditable="plaintext-only"`; the browser owns caret, typing, and
 * intra-cell selection from there. Live text and caret are mirrored into
 * surface state on every input/selection change, because the DOM copy is NOT
 * durable: any widget patch rewrites cell innerHTML from (stale) data, and a
 * full widget recreate replaces the element wholesale. `reanchor` restores
 * text, caret, and focus onto whatever element currently renders the cell.
 */

import { type ChangeDesc } from "@codemirror/state";
import { type EditorView } from "@codemirror/view";

import { renderCellInto } from "../decorations/tableCell";
import { modelAt } from "../decorations/tableGeometry";
import { cellAt } from "../decorations/tableCellNav";
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
  view: EditorView;
  tableFrom: number;
  ref: CellRef;
  el: HTMLElement;
  text: string;
  caret: number;
  original: string;
}

export class InlineCellSurface implements CellEditingSurface {
  readonly kind = "inline" as const;
  private edit: EditState | null = null;

  private readonly onInput = (): void => {
    const s = this.edit;
    if (!s) return;
    s.text = s.el.textContent ?? "";
    s.caret = caretOffset(s.el) ?? s.text.length;
  };

  private readonly onSelectionChange = (): void => {
    const s = this.edit;
    if (!s) return;
    const offset = caretOffset(s.el);
    if (offset !== null) s.caret = offset;
  };

  // Focus genuinely leaving the edit (sidebar, chat, another editor) commits
  // it — the boundary-commit model's outermost boundary. Checked a microtask
  // later so intra-table hops (commit→begin refocuses synchronously) and
  // reanchor's restore never observe a transiently blurred element.
  private readonly onFocusOut = (): void => {
    queueMicrotask(() => {
      const s = this.edit;
      if (!s) return;
      const active = s.el.ownerDocument.activeElement;
      if (active === s.el || s.el.contains(active)) return;
      this.commit(s.view);
    });
  };

  // CM6 history is the canonical undo (ADR 0001): the cell keeps NO undo
  // stack of its own. Mid-edit undo deterministically reverts to the text the
  // edit began with; committed steps belong to the main editor's history.
  private readonly onBeforeInput = (event: InputEvent): void => {
    if (!event.inputType.startsWith("history")) return;
    event.preventDefault();
    const s = this.edit;
    if (!s || event.inputType !== "historyUndo") return;
    s.text = s.original;
    s.el.textContent = s.original;
    this.placeCaret(s.original.length);
  };

  begin(view: EditorView, tableFrom: number, ref: CellRef, caret = 0): boolean {
    this.cancel();
    const el = cellElement(view, tableFrom, ref);
    const range = cellRange(view.state, tableFrom, ref);
    if (!el || !range) return false;
    const text = unescapePipes(view.state.sliceDoc(range.from, range.to));
    this.edit = { view, tableFrom, ref, el, text, caret: Math.min(caret, text.length), original: text };
    this.attach(el);
    return true;
  }

  active(): ActiveEdit | null {
    const s = this.edit;
    return s ? { ref: s.ref, text: s.text, caret: s.caret } : null;
  }

  editingElement(): HTMLElement | null {
    return this.edit?.el ?? null;
  }

  placeCaret(offset: number): void {
    const s = this.edit;
    if (!s) return;
    s.caret = Math.max(0, Math.min(offset, s.text.length));
    setCaret(s.el, s.caret);
  }

  anchor(): number | null {
    return this.edit?.tableFrom ?? null;
  }

  mapThrough(changes: ChangeDesc): void {
    if (this.edit) this.edit.tableFrom = changes.mapPos(this.edit.tableFrom);
  }

  reanchor(view: EditorView): void {
    const s = this.edit;
    if (!s) return;
    const el = cellElement(view, s.tableFrom, s.ref);
    if (!el) return;
    const clobbered =
      el !== s.el ||
      el.textContent !== s.text ||
      el.getAttribute("contenteditable") !== "plaintext-only";
    if (el !== s.el) {
      s.el.removeEventListener("input", this.onInput);
      s.el.removeEventListener("beforeinput", this.onBeforeInput);
      s.el.removeEventListener("focusout", this.onFocusOut);
      el.addEventListener("input", this.onInput);
      el.addEventListener("beforeinput", this.onBeforeInput);
      el.addEventListener("focusout", this.onFocusOut);
      s.el = el;
    }
    if (clobbered) {
      this.applyEditableState(el, s);
    } else if (el.ownerDocument.activeElement !== el) {
      el.focus();
      setCaret(el, s.caret);
    }
  }

  commit(view: EditorView): void {
    const s = this.edit;
    if (!s) return;
    const range = cellRange(view.state, s.tableFrom, s.ref);
    this.teardown();
    if (!range) return;
    if (s.text !== s.original) {
      view.dispatch({
        changes: { from: range.from, to: range.to, insert: escapePipes(s.text) },
        userEvent: "input.table.cell",
      });
      return;
    }
    // Unchanged: no transaction will re-render this cell — restore its
    // rendered content ourselves.
    const model = modelAt(view.state, s.tableFrom);
    const cell = model ? cellAt(model, s.ref.row, s.ref.col) : null;
    if (cell) renderCellInto(s.el, cell.html);
  }

  cancel(): void {
    const s = this.edit;
    if (!s) return;
    this.teardown();
    s.el.textContent = s.original;
  }

  private attach(el: HTMLElement): void {
    const s = this.edit;
    if (!s) return;
    s.view.dom.classList.add("cm-tablev2-editing");
    this.applyEditableState(el, s);
    el.addEventListener("input", this.onInput);
    el.addEventListener("beforeinput", this.onBeforeInput);
    el.addEventListener("focusout", this.onFocusOut);
    el.ownerDocument.addEventListener("selectionchange", this.onSelectionChange);
  }

  private applyEditableState(el: HTMLElement, s: EditState): void {
    el.textContent = s.text;
    el.setAttribute("contenteditable", "plaintext-only");
    el.focus();
    setCaret(el, s.caret);
  }

  private teardown(): void {
    const s = this.edit;
    if (!s) return;
    s.view.dom.classList.remove("cm-tablev2-editing");
    s.el.removeEventListener("input", this.onInput);
    s.el.removeEventListener("beforeinput", this.onBeforeInput);
    s.el.removeEventListener("focusout", this.onFocusOut);
    s.el.ownerDocument.removeEventListener("selectionchange", this.onSelectionChange);
    s.el.removeAttribute("contenteditable");
    this.edit = null;
  }
}
