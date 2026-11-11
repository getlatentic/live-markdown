/**
 * The one place a line key is decided. A key pressed with a caret is read as
 * a state — the kind of the caret's line, the kind of the line beside it, and
 * where in the line the caret is — and the table names the action for it.
 */

import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

import { lineStructure, type LineStructure } from "../core/lineStructure";
import { visibleCharBefore } from "../interaction/visiblePosition";
import { openNumberRange } from "../list/numberEditing";
import { ACTIONS, type Press } from "./actions";
import { caretAt, kindOfLine, type CaretAt, type LineKind } from "./lineKind";
import { actionFor, type LineKeyName } from "./table";

/**
 * Where Backspace finds the caret. Nothing VISIBLE between the caret and the
 * start of the line's text counts as the start, wherever the caret sits
 * among hidden markers or in front of the line's own.
 */
function backspaceAt(view: EditorView, { pos, line, structure }: Press): CaretAt {
  if (openNumberRange(view.state)) return "number";
  const textStart = (structure.list ?? structure.heading)?.markTo ?? structure.contentFrom;
  const before = visibleCharBefore(view, pos);
  if (before && before.to > textStart) return pos === line.to ? "end" : "middle";
  return view.state.sliceDoc(textStart, line.to).trim() === "" ? "blank" : "start";
}

function run(view: EditorView, key: LineKeyName, press: Press, line: LineKind, at: CaretAt): boolean {
  const beside = kindOfLine(view.state, press.line.number + (key === "Delete" ? 1 : -1));
  return ACTIONS[actionFor(key, line, beside, at)](view, press);
}

/** Run `key` by the table. False when the selection is not a caret, or the
 *  table leaves the key to the bindings below it. */
export function lineKey(view: EditorView, key: "Backspace" | "Delete" | "Enter" | "Tab" | "Shift-Tab"): boolean {
  const { state } = view;
  const { main } = state.selection;
  if (!main.empty) return false;
  const line = state.doc.lineAt(main.head);
  const press: Press = { pos: main.head, line, structure: lineStructure(state, line) };
  const at = key === "Backspace" ? backspaceAt(view, press) : caretAt(state, line, main.head);
  return run(view, key, press, kindOfLine(state, line.number), at);
}

const TYPED: [RegExp, LineKeyName][] = [
  [/^#{1,6}$/, "TypeHeading"],
  [/^[-*+]$/, "TypeBullet"],
  [/^\d+[.)]$/, "TypeOrdered"],
  [/^>$/, "TypeQuote"],
];

/** A typed marker replaces a marker of another kind, at any depth of nesting. */
function markedAs(structure: LineStructure): LineKind | null {
  if (structure.inCode) return null;
  if (structure.list) return structure.list.task ? "task" : structure.list.kind;
  return structure.heading ? "heading" : null;
}

/**
 * The space that completes a marker typed right after a line's own marker
 * (`- #` then space) is a line key of its own: the table says whether the
 * typed marker replaces the line's.
 */
export const typedMarkers = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== " " || from !== to) return false;
  const { state } = view;
  const line = state.doc.lineAt(from);
  const structure = lineStructure(state, line);
  const own = structure.list ?? structure.heading;
  const kind = markedAs(structure);
  if (!own || !kind || from <= own.markTo) return false;
  const typed = state.sliceDoc(own.markTo, from);
  const key = TYPED.find(([marker]) => marker.test(typed))?.[1];
  return key ? run(view, key, { pos: from, line, structure, typed }, kind, "start") : false;
});

/** Enter, Tab and Shift-Tab by the table, ahead of every other binding.
 *  Backspace and Delete are bound in `deleteNormalizerKeymap`. */
export const lineKeysKeymap = Prec.highest(
  keymap.of([
    { key: "Enter", run: (view) => lineKey(view, "Enter") },
    { key: "Tab", run: (view) => lineKey(view, "Tab"), shift: (view) => lineKey(view, "Shift-Tab") },
  ]),
);
