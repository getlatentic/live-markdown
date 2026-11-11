/**
 * What each action of the line-key table does. An action edits the caret's
 * line and its neighbour, and returns whether the key is taken; `false`
 * leaves it to the bindings below the table.
 */

import { EditorSelection, type ChangeSpec, type EditorState, type Line } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import { fenceBackspaceGuard } from "../code/fenceDeleteGuards";
import type { LineStructure } from "../core/lineStructure";
import { treeAt } from "../core/treeAt";
import { deleteAfter, deleteBefore, tableBefore, tableDeleteStep } from "../interaction/visibleDelete";
import { indentListItem, outdentListItem } from "../list/listIndent";
import type { Action } from "./table";

/** The caret and its line, as an action receives them. */
export interface Press {
  pos: number;
  line: Line;
  structure: LineStructure;
  /** The marker just typed at the start of the line's text, for a typed-marker key. */
  typed?: string;
}

type Run = (view: EditorView, press: Press) => boolean;

const LIST_MARK = /^(?:[-*+]|\d+[.)]) ?/;
const CONTINUED_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(\S.*)$/;

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

const markerToIndent: Run = (view, press) => {
  const { list } = press.structure;
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
  if (!inListItem(state.update({ changes: toIndent }).state, textStart)) return removeMarker(view, press);
  return erase(view, toIndent, textStart);
};

const removeIndent: Run = (view, { pos, line, structure }) => {
  if (structure.contentFrom === line.from || !inListItem(view.state, structure.contentFrom)) return deleteBefore(view, pos);
  return erase(view, { from: line.from, to: structure.contentFrom }, line.from);
};

const closeGapAbove: Run = (view, { pos, line }) => {
  const above = view.state.doc.line(line.number - 1);
  return erase(view, { from: above.from, to: line.from }, pos - (line.from - above.from));
};

const joinHeadingAbove: Run = (view, { pos, line, structure }) => {
  if (!structure.heading) return false;
  // A code fence above is structure: park beside it, never merge into it (§12.2).
  if (fenceBackspaceGuard(view, pos)) return true;
  const above = view.state.doc.line(line.number - 1);
  return erase(view, { from: above.to, to: structure.heading.markTo }, above.to);
};

/** Never edits the table's hidden source: the caret parks at the table's
 *  end, and from there the whole table goes. A heading's hashes are not text
 *  between it and the table. */
const parkAtTable: Run = (view, { pos, line, structure }) => {
  const table = tableBefore(view, structure.heading && !structure.list ? line.from : pos);
  return table ? tableDeleteStep(view, table, pos, table.to) : deleteBefore(view, pos);
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

const leaveList: Run = (view, { line, structure }) =>
  structure.list ? enter(view, { from: structure.list.markFrom, to: line.to }, structure.list.markFrom) : false;

/** The next item directly below, never with a gap. A task, or an item the
 *  line's text does not spell out (inside a quote), is left to the stock key. */
const newItem: Run = (view, { pos, line }) => {
  const match = CONTINUED_ITEM.exec(line.text);
  if (!match || /^\[[ xX]\]/.test(match[3]) || !inListItem(view.state, pos - 1)) return false;
  const [, indent, marker] = match;
  const ordered = /^(\d+)([.)])$/.exec(marker);
  const next = ordered ? `${Number.parseInt(ordered[1], 10) + 1}${ordered[2]}` : marker;
  const insert = `${view.state.lineBreak}${indent}${next} `;
  return enter(view, { from: pos, insert }, pos + insert.length);
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
  deleteAfter: (view, { pos }) => deleteAfter(view, pos),
  replaceMarker,
  splitTask,
  leaveList,
  newItem,
  openItemAbove,
  openLineAbove: (view, press) => openAbove(view, press, ""),
  moveHeadingDown,
  indentItem: (view) => indentListItem(view),
  outdentItem: (view) => outdentListItem(view),
  nothing: () => true,
  stock: () => false,
};
