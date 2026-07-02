/**
 * Fence lifecycle (#91, interaction-spec §9.5, §12.4–.6).
 *
 * An unclosed fence runs to the end of the document per CommonMark, so the
 * moment ``` is typed everything below renders as one giant code block —
 * grammar-correct, wrong WYSIWYG. The behaviors here keep blocks bounded,
 * enterable, and escapable:
 *
 *   - TYPE-TIME close (§12.4): the keystroke completing a fence opener at a
 *     line's CONTENT start — top level, inside a list item, inside a quote
 *     (positions from `lineStructure`, not a line regex) — inserts an empty
 *     content line plus the matching closer at the same content column, and
 *     the caret lands ON the content line: the first visible row of a new
 *     block accepts code immediately. Quote prefixes are carried onto the
 *     inserted lines; list prefixes become continuation indent.
 *   - ENTER close: Enter at the end of an unclosed opener line (e.g. pasted)
 *     closes it with the caret inside.
 *   - ENTER step-in (§12.5): Enter on a CLOSED block's opener whose first
 *     content line is empty moves the caret onto that line instead of
 *     inserting another.
 *   - ENTER exit (§12.6): Enter on the block's empty last content line
 *     removes that line and moves the caret below the closing fence,
 *     creating the line when the block ends the document.
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

/** The keystroke that completes a ```/~~~ opener at a line's content start
 * closes the fence below, before the unclosed state can swallow the rest of
 * the document. */
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

  // The line must have been prose before the keystroke — a backtick typed
  // inside an existing block is literal, and an opener line of a closed
  // fence (typing a 4th backtick) must not stack another closer.
  const oldLine = tr.startState.doc.lineAt(from);
  const info = lineStructure(tr.startState, oldLine);
  if (info.inCode) return tr;

  // The fence must occupy the line's whole CONTENT — everything after the
  // block markers the grammar sees (list/task marker, quote marks).
  const contentStart = info.list ? info.list.markTo : info.contentFrom;
  const newLine = tr.newDoc.lineAt(from + 1);
  const content = tr.newDoc.sliceString(contentStart, newLine.to);
  if (!/^(`{3,}|~{3,})$/.test(content) || from + 1 !== newLine.to) return tr;

  // Continuation prefix for the inserted lines: quote marks carry over,
  // everything else (list markers, indent) becomes plain indent so the new
  // lines stay inside the same container at the fence's column.
  const prefixSrc = tr.newDoc.sliceString(newLine.from, contentStart);
  const prefix = [...prefixSrc].map((c) => (c === ">" ? ">" : " ")).join("");
  const brk = tr.startState.lineBreak;
  return [
    tr,
    {
      changes: { from: newLine.to, insert: `${brk}${prefix}${brk}${prefix}${content}` },
      selection: EditorSelection.cursor(newLine.to + brk.length + prefix.length),
      sequential: true,
    },
  ];
});

/** The FencedCode ancestor at `pos`, or null. */
export function fenceAt(state: EditorState, pos: number): NodeLike | null {
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
  // Only on the fence's OPENING line.
  if (!node || node.from < line.from) return false;
  const marks = node.getChildren("CodeMark");
  const open = marks[0];
  if (!open) return false;

  if (marks.length >= 2) {
    // §12.5 — closed block: step onto an existing empty first content line.
    if (line.to < state.doc.length) {
      const next = state.doc.lineAt(line.to + 1);
      const closerLine = state.doc.lineAt(marks[marks.length - 1].from);
      if (next.number < closerLine.number && next.text.trim() === "") {
        view.dispatch({
          selection: EditorSelection.cursor(next.to),
          scrollIntoView: true,
          userEvent: "select",
        });
        return true;
      }
    }
    return false;
  }

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
