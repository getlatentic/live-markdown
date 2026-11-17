/**
 * The abstract state the line-key model works in: what kind of line the caret
 * is on, what kind of line is above it, and where in the line the caret is.
 * The parser decides each kind, so a state names what the editor shows, not
 * how the source happens to be spelled.
 */

import type { EditorState, Line } from "@codemirror/state";

import { lineStructure } from "../core/lineStructure";
import { treeAt } from "../core/treeAt";

export type LineKind =
  | "none" // no such line: above the first line, below the last
  | "empty"
  | "gap" // an empty line after a list item: text below it can still join the item
  | "quoteGap" // an empty line after a quote
  | "tableGap" // an empty line after a table
  | "paragraph"
  | "indented" // a paragraph line with spaces in front, outside any list
  | "heading"
  | "rule" // a horizontal rule
  | "bullet"
  | "ordered"
  | "task"
  | "nested" // a bullet item, indented under another
  | "nestedOrdered" // a numbered item, indented under another
  | "nestedTask" // a task item, indented under another
  | "quotedItem" // a bullet item inside a quote
  | "quotedOrdered"
  | "quotedTask"
  | "continuation" // a line of a list item other than its first, indented under it
  | "lazy" // the same, written at the margin
  | "quote"
  | "emptyQuote" // a quote mark with no text after it
  | "lazyQuote" // a line of a quote written without its `>`
  | "indentedQuote" // the same, with spaces in front
  | "fence" // the opening or closing line of a code block
  | "code"
  | "table";

/**
 * `blank`: the line has no text, so its start is also its end.
 * `margin`: at the start of a line whose text starts further in.
 * `indent`: among the spaces in front of the line's marker or text.
 * `marker`: after a marker, in front of a space that starts the text.
 * `number`: in an ordered item's number, open for editing.
 * `selection`: text is selected, from the caret's line on.
 */
export type CaretAt = "blank" | "start" | "middle" | "end" | "margin" | "indent" | "marker" | "number" | "selection";

export interface LineState {
  above: LineKind;
  line: LineKind;
  below: LineKind;
  at: CaretAt;
  /** The caret's line is in a list with an empty line between two of its items. */
  loose: boolean;
}

function ancestors(state: EditorState, pos: number): string[] {
  const names: string[] = [];
  for (let node: { name: string; parent: unknown } | null = treeAt(state, pos).resolveInner(pos, 1); node; node = node.parent as typeof node) {
    names.push(node.name);
  }
  return names;
}

type Item = "bullet" | "ordered" | "task";
const NESTED: Record<Item, LineKind> = { bullet: "nested", ordered: "nestedOrdered", task: "nestedTask" };
const QUOTED: Record<Item, LineKind> = { bullet: "quotedItem", ordered: "quotedOrdered", task: "quotedTask" };

function markedKind(state: EditorState, line: Line): LineKind | null {
  const structure = lineStructure(state, line);
  const around = ancestors(state, structure.contentFrom);
  if (around.includes("Table")) return "table";
  if (structure.inCode) return /^\s*(`{3,}|~{3,})/.test(line.text) && around.includes("FencedCode") ? "fence" : "code";
  if (structure.list) {
    const item = structure.list.task ? "task" : structure.list.kind;
    if (structure.quote) return QUOTED[item];
    return structure.list.markFrom > line.from ? NESTED[item] : item;
  }
  if (structure.heading) return "heading";
  if (around.includes("HorizontalRule")) return "rule";
  if (structure.quote) return state.sliceDoc(structure.contentFrom, line.to).trim() === "" ? "emptyQuote" : "quote";
  if (around.includes("ListItem")) return structure.contentFrom > line.from ? "continuation" : "lazy";
  if (around.includes("Blockquote")) return structure.contentFrom > line.from ? "indentedQuote" : "lazyQuote";
  return null;
}

export function kindOfLine(state: EditorState, lineNumber: number): LineKind {
  if (lineNumber < 1 || lineNumber > state.doc.lines) return "none";
  const line = state.doc.line(lineNumber);
  const marked = markedKind(state, line);
  const blank = line.text.trim() === "";
  // An empty line is empty whatever it sits inside, except in a block the
  // model does not follow into.
  if (marked && (!blank || marked === "code" || marked === "fence" || marked === "table")) return marked;
  if (!blank) return /^\s/.test(line.text) ? "indented" : "paragraph";
  return emptyKind(state, lineNumber);
}

const LIST_LINES = new Set<LineKind>([...Object.keys(NESTED), ...Object.values(NESTED), ...Object.values(QUOTED), "continuation", "lazy"] as LineKind[]);
const QUOTE_LINES = new Set<LineKind>(["quote", "emptyQuote", "lazyQuote", "indentedQuote"]);

/** An empty line takes its kind from the nearest line with text above it. */
function emptyKind(state: EditorState, lineNumber: number): LineKind {
  for (let n = lineNumber - 1; n >= 1; n--) {
    const line = state.doc.line(n);
    if (line.text.trim() === "") continue;
    const kind = markedKind(state, line);
    if (kind && LIST_LINES.has(kind)) return "gap";
    if (kind === "table") return "tableGap";
    return kind && QUOTE_LINES.has(kind) ? "quoteGap" : "empty";
  }
  return "empty";
}

export function caretAt(state: EditorState, line: Line, pos: number): CaretAt {
  if (!state.selection.main.empty) return "selection";
  const structure = lineStructure(state, line);
  const start = (structure.list ?? structure.heading)?.markTo ?? structure.contentFrom;
  if (state.sliceDoc(start, line.to).trim() === "") return "blank";
  if (pos < start) return inFrontOfText(state, line, pos);
  if (pos === start) return "start";
  return pos === line.to ? "end" : "middle";
}

function inFrontOfText(state: EditorState, line: Line, pos: number): CaretAt {
  if (pos === line.from) return "margin";
  return state.sliceDoc(line.from, pos).trim() === "" ? "indent" : "marker";
}

/** The outermost list around `pos` has an empty line in front of one of its items. */
function inLooseList(state: EditorState, pos: number): boolean {
  let list: { from: number; to: number } | null = null;
  for (let node: { name: string; from: number; to: number; parent: unknown } | null = treeAt(state, pos).resolveInner(pos, 1); node; node = node.parent as typeof node) {
    if (node.name === "BulletList" || node.name === "OrderedList") list = node;
  }
  return list !== null && /\n[ \t]*\n[ \t]*(?:[-*+]|\d+[.)])\s/.test(state.sliceDoc(list.from, list.to));
}

export function lineState(state: EditorState): LineState {
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  return {
    above: kindOfLine(state, line.number - 1),
    line: kindOfLine(state, line.number),
    below: kindOfLine(state, line.number + 1),
    at: caretAt(state, line, pos),
    loose: inLooseList(state, lineStructure(state, line).contentFrom),
  };
}
