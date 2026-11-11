/**
 * What each action of the line-key table does. An action edits the caret's
 * line and its neighbour, and returns whether it applied; `false` passes the
 * key to the next action the table names, then to the bindings below it.
 */

import { EditorSelection, type ChangeSpec, type EditorState, type Line } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import { fenceBackspaceGuard } from "../code/fenceDeleteGuards";
import type { LineStructure } from "../core/lineStructure";
import { treeAt } from "../core/treeAt";
import { applyDeletion, deleteAfter, deleteBefore, tableBefore, tableDeleteStep } from "../interaction/visibleDelete";
import { indentListItem, outdentListItem } from "../list/listIndent";
import type { Action } from "./table";

/** The caret and its line, as an action receives them. With a selection,
 *  `pos` is where it starts and `line` is the line it starts on. */
export interface Press {
  pos: number;
  /** Where the selection ends; `pos` for a caret. */
  to: number;
  line: Line;
  structure: LineStructure;
  /** The marker just typed at the start of the line's text, for a typed-marker key. */
  typed?: string;
}

type Run = (view: EditorView, press: Press) => boolean;

/** The slice of Lezer's SyntaxNode the list rules touch. */
interface SyntaxNode {
  readonly name: string;
  readonly from: number;
  readonly to: number;
  readonly parent: SyntaxNode | null;
  readonly nextSibling: SyntaxNode | null;
}

const LIST_MARK = /^(?:[-*+]|\d+[.)]) ?/;
const NUMBER = /^\d+/;

function edit(view: EditorView, changes: ChangeSpec, caret: number, userEvent: string): boolean {
  view.dispatch({ changes, selection: EditorSelection.cursor(caret), userEvent, scrollIntoView: true });
  return true;
}

const erase = (view: EditorView, changes: ChangeSpec, caret: number): boolean => edit(view, changes, caret, "delete.backward");
const enter = (view: EditorView, changes: ChangeSpec, caret: number): boolean => edit(view, changes, caret, "input");

/** `pos` is prose inside a list item, not code. */
function inListItem(state: EditorState, pos: number): boolean {
  let inItem = false;
  for (let node: { name: string; parent: unknown } | null = treeAt(state, pos).resolveInner(pos, 1); node; node = node.parent as typeof node) {
    if (node.name === "FencedCode" || node.name === "CodeBlock") return false;
    if (node.name === "ListItem") inItem = true;
  }
  return inItem;
}

const removeMarker: Run = (view, { structure }) => {
  const mark = structure.list ?? structure.heading;
  return mark ? erase(view, { from: mark.markFrom, to: mark.markTo }, mark.markFrom) : false;
};

const markerToIndent: Run = (view, { structure }) => {
  const { list } = structure;
  if (!list) return false;
  const { state } = view;
  const mark = state.sliceDoc(list.markFrom, list.markTo);
  // A task's text lines up under its checkbox: the item's content starts
  // right after the bullet, and deeper indentation would read as code.
  const indent = " ".repeat(LIST_MARK.exec(mark)?.[0].length ?? mark.length);
  const toIndent = { from: list.markFrom, to: list.markTo, insert: indent };
  const textStart = list.markFrom + indent.length;
  // Whether the indented line still belongs to an item depends on more than
  // the line above (the item's own indentation, a gap), so ask the parser.
  if (!inListItem(state.update({ changes: toIndent }).state, textStart)) return false;
  return erase(view, toIndent, textStart);
};

const removeIndent: Run = (view, { line, structure }) => erase(view, { from: line.from, to: structure.contentFrom }, line.from);

const closeGapAbove: Run = (view, { pos, line }) => {
  const above = view.state.doc.line(line.number - 1);
  return erase(view, { from: above.from, to: line.from }, pos - (line.from - above.from));
};

const joinHeadingAbove: Run = (view, { line, structure }) => {
  if (!structure.heading) return false;
  const above = view.state.doc.line(line.number - 1);
  return erase(view, { from: above.to, to: structure.heading.markTo }, above.to);
};

/** Never edits the table's hidden source: the caret parks at the table's
 *  end, and from there the whole table goes. A heading's hashes are not text
 *  between it and the table. */
const parkAtTable: Run = (view, { pos, line, structure }) => {
  const table = tableBefore(view, structure.heading && !structure.list ? line.from : pos);
  return table ? tableDeleteStep(view, table, pos, table.to) : false;
};

/** The line's own marker gives way to the one typed after it. */
const replaceMarker: Run = (view, { pos, structure, typed }) => {
  const own = structure.list ?? structure.heading;
  if (!own || !typed) return false;
  return edit(view, { from: own.markFrom, to: pos, insert: `${typed} ` }, own.markFrom + typed.length + 1, "input.type");
};

/**
 * The stock split leaves the empty item spelled `- [ ]`, without its space,
 * which the grammar reads as a bullet with the text `[ ]`. The line above
 * keeps an empty unchecked box; the text moves down with the marker and the
 * state it had (#95).
 */
const splitTask: Run = (view, { pos, line, structure }) => {
  const { list } = structure;
  if (!list) return false;
  const { state } = view;
  const mark = state.sliceDoc(list.markFrom, list.markTo);
  const insert = `${state.lineBreak}${state.sliceDoc(line.from, list.markFrom)}${mark}`;
  return enter(
    view,
    [
      { from: list.markFrom, to: list.markTo, insert: mark.replace(/\[[xX]\]/, "[ ]") },
      { from: pos, insert },
    ],
    pos + insert.length,
  );
};

/** A line's text does not start with the space that followed its first
 *  words, once those are deleted. */
const deleteSelection: Run = (view, { pos, to, structure }) => {
  const textStart = (structure.list ?? structure.heading)?.markTo ?? structure.contentFrom;
  if (pos !== textStart || structure.inCode) return applyDeletion(view, pos, to);
  const rest = view.state.doc.lineAt(to);
  const spaces = /^ */.exec(view.state.sliceDoc(to, rest.to))?.[0].length ?? 0;
  return applyDeletion(view, pos, to + (to + spaces < rest.to ? spaces : 0));
};

const leaveList: Run = (view, { line, structure }) =>
  structure.list ? enter(view, { from: structure.list.markFrom, to: line.to }, structure.list.markFrom) : false;

/** The marker of the item after one marked `mark`: the next number, an empty box. */
function nextMarker(mark: string): string {
  const next = mark.replace(NUMBER, (digits) => String(Number.parseInt(digits, 10) + 1)).replace(/\[[xX]\]/, "[ ]");
  return `${next.trimEnd()} `;
}

/** The numbers of the items after the one at `pos`, each raised by one, as
 *  far as they count up from it. */
function renumberBelow(state: EditorState, pos: number): ChangeSpec[] {
  let item = treeAt(state, pos).resolveInner(pos, -1) as SyntaxNode | null;
  while (item && !(item.name === "ListItem" && item.parent?.name === "OrderedList")) item = item.parent;
  const changes: ChangeSpec[] = [];
  let expected = item ? numberOf(state, item) : null;
  for (let next = item?.nextSibling ?? null; next && expected !== null; next = next.nextSibling) {
    if (numberOf(state, next) !== expected + 1) break;
    expected += 1;
    const digits = NUMBER.exec(state.sliceDoc(next.from, next.to))?.[0] ?? "";
    changes.push({ from: next.from, to: next.from + digits.length, insert: String(expected + 1) });
  }
  return changes;
}

function numberOf(state: EditorState, item: SyntaxNode): number | null {
  const digits = NUMBER.exec(state.sliceDoc(item.from, item.to))?.[0];
  return digits ? Number.parseInt(digits, 10) : null;
}

/**
 * Split the line: what stands before `from` stays, `carried` starts the new
 * line, and the selection goes. Text split in front of a space starts the
 * new line without it.
 */
function split(view: EditorView, { to }: Press, from: number, upper: string, carried: string, more: ChangeSpec[] = []): boolean {
  const { state } = view;
  const rest = state.doc.lineAt(to);
  const inText = state.sliceDoc(rest.from, to).trim() !== "";
  const spaces = inText ? (/^[ \t]+(?=\S)/.exec(state.sliceDoc(to, rest.to))?.[0].length ?? 0) : 0;
  const insert = upper + state.lineBreak + carried;
  return enter(view, [{ from, to: to + spaces, insert }, ...more], from + insert.length);
}

/** Where the text before `pos` on its line ends, apart from spaces. */
function textEnd(state: EditorState, line: Line, pos: number): number {
  return line.from + state.sliceDoc(line.from, pos).trimEnd().length;
}

/** The next item directly below, never with a gap. An ordered item takes
 *  the next number, and the items after it count on. */
const splitItem: Run = (view, press) => {
  const { line, structure } = press;
  const { list } = structure;
  if (!list) return false;
  const { state } = view;
  const pos = Math.max(press.pos, list.markTo);
  const carried = state.sliceDoc(line.from, list.markFrom) + nextMarker(state.sliceDoc(list.markFrom, list.markTo));
  // A task's box needs its space to stay a box.
  const from = list.task ? pos : textEnd(state, line, pos);
  return split(view, { ...press, to: Math.max(press.to, pos) }, from, "", carried, renumberBelow(state, pos));
};

/** A line of a quote written without its mark gets one when it is split,
 *  so both halves stay in the quote. */
const continueQuote: Run = (view, press) => {
  const { pos, line, structure } = press;
  const { state } = view;
  const own = structure.quote ? state.sliceDoc(line.from, structure.contentFrom) : "";
  const from = textEnd(state, line, pos);
  return split(view, press, from, from === line.from ? ">" : "", own || "> ");
};

/** The new line starts as this one does, up to the caret: its indent, and
 *  the quote a heading stands in. A line split inside its indent leaves an
 *  empty line above, not one of spaces. */
const newline: Run = (view, press) => {
  const { pos, line, structure } = press;
  const start = Math.min(pos, structure.contentFrom);
  return split(view, press, start === pos ? line.from : pos, "", view.state.sliceDoc(line.from, start));
};

/** Insert `above` and a line break in front of the caret's line. */
function openAbove(view: EditorView, { pos, line }: Press, above: string): boolean {
  const insert = above + view.state.lineBreak;
  return enter(view, { from: line.from, insert }, pos + insert.length);
}

/** An empty item cannot begin a list directly under text, so the one opened
 *  above this item stands after an empty line. */
const openItemAbove: Run = (view, press) => {
  const { list } = press.structure;
  if (!list) return false;
  const marker = view.state.sliceDoc(press.line.from, list.markTo).trimEnd();
  return openAbove(view, press, `${view.state.lineBreak}${marker}`);
};

/** Splitting at a heading's start would keep the hashes on the empty line
 *  and turn the heading's text into body text. */
const moveHeadingDown: Run = (view, { pos, line, structure }) => {
  const { heading } = structure;
  if (!heading) return false;
  // What stands in front of the hashes (a quote's `> `) starts both lines.
  const insert = view.state.lineBreak + view.state.sliceDoc(line.from, heading.markFrom);
  return enter(view, { from: heading.markFrom, insert }, pos + insert.length);
};

export const ACTIONS: Record<Action, Run> = {
  deleteBefore: (view, { pos }) => deleteBefore(view, pos),
  removeMarker,
  markerToIndent,
  removeIndent,
  closeGapAbove,
  joinHeadingAbove,
  parkAtTable,
  parkAtFence: (view, { pos }) => fenceBackspaceGuard(view, pos),
  deleteSelection,
  deleteAfter: (view, { pos }) => deleteAfter(view, pos),
  replaceMarker,
  splitItem,
  splitTask,
  leaveList,
  continueQuote,
  newline,
  openItemAbove,
  openLineAbove: (view, press) => openAbove(view, press, ""),
  moveHeadingDown,
  indentItem: (view) => indentListItem(view),
  outdentItem: (view) => outdentListItem(view),
  nothing: () => true,
  typeText: () => false,
  blockRule: () => false,
};
