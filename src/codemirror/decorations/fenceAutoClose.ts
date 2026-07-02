/**
 * Auto-close a just-typed code fence (#91).
 *
 * An unclosed fence runs to the end of the document per CommonMark, so the
 * moment ``` is typed everything below renders as one giant code block —
 * grammar-correct, wrong WYSIWYG. Enter at the end of an UNCLOSED opening
 * fence line inserts the matching closing fence and puts the caret inside
 * the now-empty block; any content below is released back to prose.
 *
 * Closed fences (editing an existing block's info string), mid-line carets,
 * and everything else fall through to the stock Enter handlers.
 */

import { syntaxTree } from "@codemirror/language";
import { EditorSelection, Prec } from "@codemirror/state";
import { keymap, type Command } from "@codemirror/view";

type NodeLike = {
  readonly name: string;
  readonly from: number;
  readonly to: number;
  readonly parent: NodeLike | null;
  getChildren(type: string): readonly NodeLike[];
};

export const fenceAutoClose: Command = (view) => {
  const { state } = view;
  const { main } = state.selection;
  if (!main.empty) return false;
  const line = state.doc.lineAt(main.head);
  if (main.head !== line.to) return false;

  let node = syntaxTree(state).resolveInner(main.head, -1) as unknown as NodeLike | null;
  while (node && node.name !== "FencedCode") node = node.parent;
  // Only on the fence's OPENING line (where it was just typed).
  if (!node || node.from < line.from) return false;
  const marks = node.getChildren("CodeMark");
  // Two marks = the fence is already closed.
  if (marks.length >= 2) return false;
  const open = marks[0];
  if (!open) return false;

  const fence = state.sliceDoc(open.from, open.to);
  const indent = state.sliceDoc(line.from, open.from);
  view.dispatch({
    changes: { from: line.to, insert: `${state.lineBreak}${state.lineBreak}${indent}${fence}` },
    selection: EditorSelection.cursor(line.to + state.lineBreak.length),
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
};

export const fenceAutoCloseKeymap = Prec.highest(
  keymap.of([{ key: "Enter", run: fenceAutoClose }]),
);
