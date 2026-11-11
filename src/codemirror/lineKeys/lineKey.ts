/**
 * The one place a line key is decided. A key pressed with a caret is read as
 * a state — the kind of the caret's line, the kind of the line above, and
 * where in the line the caret is — and the table names the action for it.
 *
 * Two things come before the table, because they are modes of the editor
 * and not kinds of line: a number open for editing is plain text, and a
 * table just above the caret is taken in two presses (§8.4).
 */

import { Prec } from "@codemirror/state";
import { keymap, type EditorView } from "@codemirror/view";

import { lineStructure } from "../core/lineStructure";
import { deleteBefore, tableBefore, tableDeleteStep } from "../interaction/visibleDelete";
import { visibleCharBefore } from "../interaction/visiblePosition";
import { openNumberRange } from "../list/numberEditing";
import { ACTIONS, type Press } from "./actions";
import { caretAt, kindOfLine, type CaretAt } from "./lineKind";
import { actionFor, type LineKeyName } from "./table";

/**
 * Where Backspace finds the caret. Nothing VISIBLE between the caret and the
 * start of the line's text counts as the start, wherever the caret sits
 * among hidden markers or in front of the line's own.
 */
function backspaceAt(view: EditorView, { pos, line, structure }: Press): CaretAt {
  const textStart = (structure.list ?? structure.heading)?.markTo ?? structure.contentFrom;
  const before = visibleCharBefore(view, pos);
  if (before && before.to > textStart) return pos === line.to ? "end" : "middle";
  return view.state.sliceDoc(textStart, line.to).trim() === "" ? "blank" : "start";
}

function backspaceMode(view: EditorView, press: Press, at: CaretAt): boolean | null {
  if (openNumberRange(view.state)) return deleteBefore(view, press.pos);
  // A heading's hashes are not text between it and the table above.
  const atHeadingStart = (at === "start" || at === "blank") && press.structure.heading && !press.structure.list;
  const table = tableBefore(view, atHeadingStart ? press.line.from : press.pos);
  return table ? tableDeleteStep(view, table, press.pos, table.to) : null;
}

/** Run `key` by the table. False when the selection is not a caret, or the
 *  table leaves the key to the bindings below it. */
export function lineKey(view: EditorView, key: LineKeyName): boolean {
  const { state } = view;
  const { main } = state.selection;
  if (!main.empty) return false;
  const line = state.doc.lineAt(main.head);
  const press: Press = { pos: main.head, line, structure: lineStructure(state, line) };
  const at = key === "Backspace" ? backspaceAt(view, press) : caretAt(state, line, main.head);
  if (key === "Backspace") {
    const taken = backspaceMode(view, press, at);
    if (taken !== null) return taken;
  }
  const action = actionFor(key, kindOfLine(state, line.number), kindOfLine(state, line.number - 1), at);
  return ACTIONS[action](view, press);
}

/** Enter, Tab and Shift-Tab by the table, ahead of every other binding.
 *  Backspace is bound with Delete, in `deleteNormalizerKeymap`. */
export const lineKeysKeymap = Prec.highest(
  keymap.of([
    { key: "Enter", run: (view) => lineKey(view, "Enter") },
    { key: "Tab", run: (view) => lineKey(view, "Tab"), shift: (view) => lineKey(view, "Shift-Tab") },
  ]),
);
