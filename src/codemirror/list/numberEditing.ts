/**
 * Editing an ordered item's number. The number draws as one atomic widget —
 * renumbered for display — so the caret can never rest between its digits, and
 * an edit beside it lands outside the number or removes it whole. A click on
 * the number opens it: its digits show as text with the caret where the click
 * fell, and they edit like any text. It draws as a number again once the caret
 * leaves it, or Enter or Escape confirms it.
 */

import { EditorSelection, Prec, StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, type ViewUpdate } from "@codemirror/view";

/** An ordered marker's text. No digits at all keeps an emptied number open while the new one is typed. */
const MARKER = /^\d*[.)]/;

const openNumber = StateEffect.define<number>();
const closeNumber = StateEffect.define<null>();

/** Where the ordered marker open for editing starts, or `null`. */
export const openNumberField = StateField.define<number | null>({
  create: () => null,
  update(open, tr) {
    for (const effect of tr.effects) {
      if (effect.is(openNumber)) return effect.value;
      if (effect.is(closeNumber)) return null;
    }
    if (open === null) return null;
    const from = tr.changes.mapPos(open, -1);
    const marker = markerAt(tr.state, from);
    const { main } = tr.state.selection;
    return marker && main.empty && main.head >= marker.from && main.head <= marker.to ? from : null;
  },
});

function markerAt(state: EditorState, from: number): { from: number; to: number } | null {
  const match = MARKER.exec(state.sliceDoc(from, state.doc.lineAt(from).to));
  return match ? { from, to: from + match[0].length } : null;
}

/** The number open for editing, digits and delimiter; `null` when none is. */
export function openNumberRange(state: EditorState): { from: number; to: number } | null {
  const from = state.field(openNumberField, false);
  return from === null || from === undefined ? null : markerAt(state, from);
}

/** Whether a number opened or closed, which changes how it draws. */
export function openNumberChanged(update: ViewUpdate): boolean {
  return update.startState.field(openNumberField, false) !== update.state.field(openNumberField, false);
}

/** Open the number whose marker starts at `from`, the caret `offset` digits in. */
export function editNumber(view: EditorView, from: number, offset: number): boolean {
  const marker = markerAt(view.state, from);
  if (!marker) return false;
  const digits = marker.to - marker.from - 1;
  view.dispatch({
    selection: EditorSelection.cursor(marker.from + Math.max(0, Math.min(digits, offset))),
    effects: openNumber.of(from),
    userEvent: "select.pointer",
  });
  return true;
}

/** Put the caret back at the item's text, which draws the number again. */
function confirmNumber(view: EditorView): boolean {
  const marker = openNumberRange(view.state);
  if (!marker) return false;
  const textStart = Math.min(view.state.doc.lineAt(marker.from).to, marker.to + 1);
  view.dispatch({ selection: EditorSelection.cursor(textStart), effects: closeNumber.of(null) });
  return true;
}

/** The character boundary nearest the pointer, in the drawn number's own text. */
function offsetUnder(number: HTMLElement, event: MouseEvent): number {
  const range = document.caretRangeFromPoint?.(event.clientX, event.clientY);
  if (range && number.contains(range.startContainer)) return range.startOffset;
  const box = number.getBoundingClientRect();
  const length = number.textContent?.length ?? 0;
  return Math.round(((event.clientX - box.left) / Math.max(box.width, 1)) * length);
}

const openOnClick = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.button !== 0 || event.shiftKey || event.metaKey || event.altKey || event.ctrlKey) return false;
    const number = event.target instanceof Element ? event.target.closest(".cm-ordered-marker") : null;
    if (!(number instanceof HTMLElement)) return false;
    if (!editNumber(view, view.posAtDOM(number), offsetUnder(number, event))) return false;
    view.focus();
    event.preventDefault();
    return true;
  },
});

/** Click to edit an ordered item's number; Enter or Escape confirms it. Ahead
 *  of list continuation, which would otherwise take Enter as a new item. */
export const numberEditing: Extension = [
  openNumberField,
  openOnClick,
  Prec.highest(
    keymap.of([
      { key: "Enter", run: confirmNumber },
      { key: "Escape", run: confirmNumber },
    ]),
  ),
];
