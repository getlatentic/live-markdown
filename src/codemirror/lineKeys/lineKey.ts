/**
 * The one place a line key is decided. A key pressed with a caret is read as
 * a state — the kind of the caret's line, the kind of the line beside it, and
 * where in the line the caret is — and the table names the action for it.
 */

import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

import { lineStructure, type LineStructure } from "../core/lineStructure";
import { lineBreakSite } from "../interaction/flankingGuard";
import { tableBefore } from "../interaction/visibleDelete";
import { visibleCharBefore } from "../interaction/visiblePosition";
import { openNumberRange } from "../list/numberEditing";
import { ACTIONS, type Press } from "./actions";
import { hostKindOfLine, lineKeyRulesFacet, runHostRules } from "./hostRules";
import { caretAt, kindOfLine, type CaretAt, type LineKind } from "./lineKind";
import { actionsFor, type LineKeyName } from "./table";

/**
 * Where Backspace finds the caret. Nothing VISIBLE between the caret and the
 * start of the line's text counts as the start, wherever the caret sits
 * among hidden markers or in front of the line's own.
 */
function backspaceAt(view: EditorView, { pos, line, structure }: Press, kind: LineKind): CaretAt {
  if (openNumberRange(view.state)) return "number";
  // A table is one drawn block: its end is the only place beside it.
  if (kind === "table") return tableBefore(view, pos)?.to === pos ? "end" : "middle";
  const textStart = (structure.list ?? structure.heading)?.markTo ?? structure.contentFrom;
  const before = visibleCharBefore(view, pos);
  if (before && before.to > textStart) return pos === line.to ? "end" : "middle";
  return view.state.sliceDoc(textStart, line.to).trim() === "" ? "blank" : "start";
}

/** The line beside the caret's: where a selection ends, the line below for
 *  Delete, the line above for every other key. */
function besideLine({ state }: EditorView, key: LineKeyName, { to, line }: Press, at: CaretAt): number {
  if (at === "selection") return state.doc.lineAt(to).number;
  return line.number + (key === "Delete" ? 1 : -1);
}

function run(view: EditorView, key: LineKeyName, press: Press, line: LineKind, at: CaretAt): boolean {
  const { state } = view;
  const besideNumber = besideLine(view, key, press, at);
  const beside = kindOfLine(state, besideNumber);
  // A host's rules are asked first, and see the kinds its readers name.
  if (state.facet(lineKeyRulesFacet).length > 0) {
    const besideText = besideNumber >= 1 && besideNumber <= state.doc.lines ? state.doc.line(besideNumber) : null;
    const asked = { ...press, key, at, kind: hostKindOfLine(state, press.line) ?? line, beside: hostKindOfLine(state, besideText) ?? beside };
    if (runHostRules(view, asked)) return true;
  }
  return actionsFor(key, line, beside, at).some((action) => ACTIONS[action](view, press));
}

/** Run `key` by the table. False when the table leaves the key to the
 *  bindings below it. */
export function lineKey(view: EditorView, key: "Backspace" | "Delete" | "Enter" | "Tab" | "Shift-Tab"): boolean {
  const { state } = view;
  const { main } = state.selection;
  // Enter at the edge of styled text splits the line outside its markers.
  const from = key === "Enter" && main.empty ? lineBreakSite(state, main.from) : main.from;
  const line = state.doc.lineAt(from);
  const press: Press = { pos: from, to: main.empty ? from : main.to, line, structure: lineStructure(state, line) };
  const kind = kindOfLine(state, line.number);
  const at = key === "Backspace" && main.empty ? backspaceAt(view, press, kind) : caretAt(state, line, from);
  return run(view, key, press, kind, at);
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
  return key ? run(view, key, { pos: from, to, line, structure, typed }, kind, "start") : false;
});

/** Enter, Tab and Shift-Tab by the table, ahead of every other binding.
 *  Backspace and Delete are bound in `deleteNormalizerKeymap`. */
export const lineKeysKeymap = Prec.highest(
  keymap.of([
    { key: "Enter", run: (view) => lineKey(view, "Enter") },
    { key: "Tab", run: (view) => lineKey(view, "Tab"), shift: (view) => lineKey(view, "Shift-Tab") },
  ]),
);
