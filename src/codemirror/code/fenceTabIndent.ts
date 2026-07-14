/**
 * Tab inside a fenced code block indents; Shift-Tab dedents (§12.8).
 *
 * Without a binding, the browser's default Tab handling moves FOCUS — the
 * caret "jumped out of the editor to the rich/raw button" mid-code. Both
 * commands decline outside code so list indentation (`listIndent.ts`) and
 * the accessibility default keep their behavior everywhere else.
 */

import { EditorSelection, Prec } from "@codemirror/state";
import { type Command, keymap } from "@codemirror/view";

import { fenceAt } from "./fenceAutoClose";

const INDENT = "  ";

/** Caret strictly inside a fence (not on the opener/closer lines). */
function inFenceContent(view: Parameters<Command>[0]): boolean {
  const { state } = view;
  const head = state.selection.main.head;
  const node = fenceAt(state, head);
  if (!node) return false;
  const line = state.doc.lineAt(head);
  const marks = node.getChildren("CodeMark");
  if (line.from <= node.from) return false;
  const closer = marks.length >= 2 ? marks[marks.length - 1] : null;
  return !closer || line.to < state.doc.lineAt(closer.from).from;
}

export const fenceTabIndent: Command = (view) => {
  if (!inFenceContent(view)) return false;
  const head = view.state.selection.main.head;
  view.dispatch({
    changes: { from: head, insert: INDENT },
    selection: EditorSelection.cursor(head + INDENT.length),
    userEvent: "input.type",
  });
  return true;
};

export const fenceTabDedent: Command = (view) => {
  if (!inFenceContent(view)) return false;
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.head);
  const leading = line.text.match(/^ {1,2}/)?.[0].length ?? 0;
  if (leading === 0) return true;
  view.dispatch({
    changes: { from: line.from, to: line.from + leading, insert: "" },
    userEvent: "delete.dedent",
  });
  return true;
};

export const fenceTabKeymap = Prec.high(
  keymap.of([
    { key: "Tab", run: fenceTabIndent },
    { key: "Shift-Tab", run: fenceTabDedent },
  ]),
);
