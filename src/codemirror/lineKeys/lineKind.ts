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
  | "paragraph"
  | "indented" // a paragraph line with spaces in front, outside any list
  | "heading"
  | "bullet"
  | "ordered"
  | "task"
  | "nested" // a bullet or numbered item, indented under another
  | "nestedTask" // a task item, indented under another
  | "continuation" // a line of a list item other than its first, indented under it
  | "lazy" // the same, written at the margin
  | "quote"
  | "lazyQuote" // a line of a quote written without its `>`
  | "indentedQuote" // the same, with spaces in front
  | "fence" // the opening or closing line of a code block
  | "code"
  | "table";

/** `blank`: the line has no text, so its start is also its end. */
export type CaretAt = "blank" | "start" | "middle" | "end" | "marker";

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

function markedKind(state: EditorState, line: Line): LineKind | null {
  const structure = lineStructure(state, line);
  const around = ancestors(state, structure.contentFrom);
  if (around.includes("Table")) return "table";
  if (structure.inCode) return /^\s*(`{3,}|~{3,})/.test(line.text) && around.includes("FencedCode") ? "fence" : "code";
  if (structure.list) {
    if (state.sliceDoc(line.from, structure.list.markFrom).trim() === "" && structure.list.markFrom > line.from) return structure.list.task ? "nestedTask" : "nested";
    return structure.list.task ? "task" : structure.list.kind;
  }
  if (structure.heading) return "heading";
  if (structure.quote) return "quote";
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

const LIST_LINES = new Set<LineKind>(["bullet", "ordered", "task", "nested", "nestedTask", "continuation", "lazy"]);
const QUOTE_LINES = new Set<LineKind>(["quote", "lazyQuote", "indentedQuote"]);

/** An empty line takes its kind from the nearest line with text above it. */
function emptyKind(state: EditorState, lineNumber: number): LineKind {
  for (let n = lineNumber - 1; n >= 1; n--) {
    const line = state.doc.line(n);
    if (line.text.trim() === "") continue;
    const kind = markedKind(state, line);
    if (kind && LIST_LINES.has(kind)) return "gap";
    return kind && QUOTE_LINES.has(kind) ? "quoteGap" : "empty";
  }
  return "empty";
}

export function caretAt(state: EditorState, line: Line, pos: number): CaretAt {
  const structure = lineStructure(state, line);
  const start = (structure.list ?? structure.heading)?.markTo ?? structure.contentFrom;
  if (state.sliceDoc(start, line.to).trim() === "") return "blank";
  if (pos < start) return "marker";
  if (pos === start) return "start";
  return pos === line.to ? "end" : "middle";
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
