/**
 * Fence lifecycle (#91, interaction-spec §9.5).
 *
 * An unclosed fence runs to the end of the document per CommonMark, so the
 * moment ``` is typed everything below renders as one giant code block —
 * grammar-correct, wrong WYSIWYG. Three behaviors keep the block bounded and
 * escapable:
 *
 *   - TYPE-TIME close: the keystroke that completes a bare fence opener on
 *     its own line inserts the matching closing fence right below, caret
 *     staying put (so a language tag can follow). Content below is never
 *     hijacked, not even transiently.
 *   - ENTER close: Enter at the end of an unclosed opening fence line (e.g.
 *     the opener arrived by paste) closes it with the caret inside.
 *   - ENTER exit: Enter on the block's EMPTY last content line removes that
 *     line and moves the caret to the line after the block — the same way
 *     Enter on an empty list item leaves the list. Creates the line when the
 *     block ends the document, so the block is never a trap.
 *
 * Known gap, spec-noted: lengthening a closed fence's opener in place
 * (```` over ``` ) makes the closer too short; the block re-opens until the
 * closer is edited to match.
 */

import { syntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState, Prec, type Transaction } from "@codemirror/state";
import { keymap, type Command } from "@codemirror/view";

import { lineStructure } from "./lineStructure";

type NodeLike = {
  readonly name: string;
  readonly from: number;
  readonly to: number;
  readonly parent: NodeLike | null;
  getChildren(type: string): readonly NodeLike[];
};

const BARE_FENCE = /^(\s{0,3})(`{3,}|~{3,})$/;

/** The keystroke that completes a bare ```/~~~ opener closes the fence
 * below, before the unclosed state can swallow the rest of the document. */
export const fenceTypeAutoClose = EditorState.transactionFilter.of((tr: Transaction) => {
  if (!tr.docChanged || !tr.isUserEvent("input.type") || tr.isUserEvent("input.type.compose")) {
    return tr;
  }
  let single: { from: number; ch: string } | null = null;
  let eligible = true;
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    const ch = inserted.toString();
    if (single || fromA !== toA || (ch !== "`" && ch !== "~")) eligible = false;
    else single = { from: fromA, ch };
  });
  if (!eligible || !single) return tr;
  const { from } = single as { from: number };

  // The fence must be complete AFTER this keystroke…
  const newLine = tr.newDoc.lineAt(from + 1);
  const match = BARE_FENCE.exec(newLine.text);
  if (!match || from + 1 !== newLine.to) return tr;
  // …and the line must have been PROSE before it: typing a backtick inside an
  // existing code block is literal, and re-firing on a fence line (typing the
  // 4th backtick of an already-closed opener) would stack extra closers.
  const oldLine = tr.startState.doc.lineAt(from);
  if (lineStructure(tr.startState, oldLine).inCode) return tr;

  const [, indent, fence] = match;
  return [
    tr,
    {
      changes: { from: newLine.to, insert: `${tr.startState.lineBreak}${indent}${fence}` },
      sequential: true,
    },
  ];
});

/** The FencedCode ancestor at `pos`, or null. */
function fenceAt(state: EditorState, pos: number): NodeLike | null {
  let node = syntaxTree(state).resolveInner(pos, -1) as unknown as NodeLike | null;
  while (node && node.name !== "FencedCode") node = node.parent;
  return node;
}

export const fenceAutoClose: Command = (view) => {
  const { state } = view;
  const { main } = state.selection;
  if (!main.empty) return false;
  const line = state.doc.lineAt(main.head);
  if (main.head !== line.to) return false;

  const node = fenceAt(state, main.head);
  // Only on the fence's OPENING line (where it was just typed/pasted).
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

/** Enter on the block's empty last content line exits below the fence. */
export const fenceExitBlock: Command = (view) => {
  const { state } = view;
  const { main } = state.selection;
  if (!main.empty) return false;
  const line = state.doc.lineAt(main.head);
  if (line.from !== line.to) return false; // only a fully empty line exits

  const node = fenceAt(state, main.head);
  if (!node || node.from >= line.from) return false;
  const marks = node.getChildren("CodeMark");
  if (marks.length < 2) return false; // unclosed: Enter just adds code lines
  const closing = marks[marks.length - 1];
  // The empty line must sit directly above the closing fence line.
  if (state.doc.lineAt(closing.from).number !== line.number + 1) return false;

  const docLen = state.doc.length;
  const changes = [{ from: line.from - 1, to: line.to, insert: "" }] as {
    from: number;
    to?: number;
    insert: string;
  }[];
  if (node.to === docLen) changes.push({ from: docLen, insert: state.lineBreak });
  const removed = line.to - line.from + 1;
  view.dispatch({
    changes,
    // Just past the (shifted) closing fence's newline — the line below.
    selection: EditorSelection.cursor(node.to - removed + 1),
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
};

export const fenceAutoCloseKeymap = Prec.highest(
  keymap.of([
    { key: "Enter", run: fenceAutoClose },
    { key: "Enter", run: fenceExitBlock },
  ]),
);
