/**
 * Backspace with nothing visible between the caret and the start of its
 * line's content — spec §8.2a–§8.2d. The rules run in order and the first
 * that applies makes the edit:
 *
 *   heading, first line of the document → the hashes go, the text stays
 *   heading below an empty line         → the empty line goes (§8.2b)
 *   heading below text                  → it joins the line above (§8.2c)
 *   list item inside a list             → the marker becomes indentation (§8.2d)
 *   list item with no item to stay in   → the marker goes (§8.2a)
 *   indented line inside a list item    → the indentation goes (§8.2d)
 */

import { EditorSelection, type ChangeSpec, type EditorState, type Line } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import { fenceBackspaceGuard } from "../code/fenceDeleteGuards";
import type { LineListInfo, LineStructure } from "../core/lineStructure";
import { treeAt } from "../core/treeAt";

type Heading = NonNullable<LineStructure["heading"]>;

const LIST_MARK = /^(?:[-*+]|\d+[.)]) ?/;

function edit(view: EditorView, change: ChangeSpec, caret: number): boolean {
  view.dispatch({
    changes: change,
    selection: EditorSelection.cursor(caret),
    userEvent: "delete.backward",
    scrollIntoView: true,
  });
  return true;
}

/** `pos` is prose inside a list item, not code. */
function inListItem(state: EditorState, pos: number): boolean {
  let inItem = false;
  for (let node: { name: string; parent: unknown } | null = treeAt(state, pos).resolveInner(pos, 1); node; node = node.parent as typeof node) {
    if (node.name === "FencedCode" || node.name === "CodeBlock") return false;
    if (node.name === "ListItem") inItem = true;
  }
  return inItem;
}

function headingBackspace(view: EditorView, pos: number, line: Line, heading: Heading): boolean {
  if (line.number === 1) return edit(view, { from: heading.markFrom, to: heading.markTo }, heading.markFrom);
  const above = view.state.doc.line(line.number - 1);
  if (above.text.trim() === "") {
    return edit(view, { from: above.from, to: line.from }, pos - (line.from - above.from));
  }
  // A code fence above is structure: park beside it, never merge into it (§12.2).
  if (fenceBackspaceGuard(view, pos)) return true;
  return edit(view, { from: above.to, to: heading.markTo }, above.to);
}

function listBackspace(view: EditorView, list: LineListInfo): boolean {
  const { state } = view;
  const mark = state.sliceDoc(list.markFrom, list.markTo);
  // A task's text lines up under its checkbox: the item's content starts
  // right after the bullet, and deeper indentation would read as code.
  const indent = " ".repeat(LIST_MARK.exec(mark)?.[0].length ?? mark.length);
  const toIndent = { from: list.markFrom, to: list.markTo, insert: indent };
  const contentStart = list.markFrom + indent.length;
  // Whether the indented line still belongs to an item depends on the lines
  // around it (blank lines, the item's own indentation), so ask the parser.
  if (inListItem(state.update({ changes: toIndent }).state, contentStart)) {
    return edit(view, toIndent, contentStart);
  }
  return edit(view, { from: list.markFrom, to: list.markTo }, list.markFrom);
}

/**
 * Apply the rule for a caret at the start of `line`'s content. False when the
 * line has no marker or list indentation to take, leaving the key to the
 * plain line join.
 */
export function backspaceAtLineStart(view: EditorView, pos: number, line: Line, structure: LineStructure): boolean {
  if (structure.list) return listBackspace(view, structure.list);
  if (structure.heading) return headingBackspace(view, pos, line, structure.heading);
  const indented = structure.contentFrom > line.from && !structure.quote && !structure.inCode;
  if (indented && inListItem(view.state, structure.contentFrom)) {
    return edit(view, { from: line.from, to: structure.contentFrom }, line.from);
  }
  return false;
}
