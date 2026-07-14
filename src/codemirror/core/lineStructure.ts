/**
 * What the GRAMMAR says a line is — resolved from the Lezer syntax tree, not
 * from regexes over the line's text (#61). Text lies where the tree doesn't:
 * `- item` inside a code fence isn't a list item, a nested `  - item` is one
 * even though its marker isn't at column 0, and `    - item` under a list is
 * a nested item while the same text at top level is indented code. Commands
 * that reshape a line consult this and edit the marker range the PARSER
 * identified.
 */

import { syntaxTree } from "@codemirror/language";
import type { EditorState, Line } from "@codemirror/state";

export interface LineListInfo {
  kind: "bullet" | "ordered";
  /** The item carries a task checkbox (`- [ ] …`). */
  task: boolean;
  /** Source range of the list marker (plus checkbox for tasks), INCLUDING the
   * single space that separates it from the content. */
  markFrom: number;
  markTo: number;
}

export interface LineStructure {
  /** Line belongs to a BLOCK code context (fenced or indented code, including
   * the fence lines themselves) — structure commands must not rewrite code.
   * Inline code inside a paragraph does not count: the line is still prose. */
  inCode: boolean;
  /** ATX heading when the line is one, with its mark range (hashes +
   * following space). */
  heading: { level: number; markFrom: number; markTo: number } | null;
  list: LineListInfo | null;
  /** Outermost blockquote marker starting this line (`> `), when present. */
  quote: { markFrom: number; markTo: number } | null;
  /** Where this line's own content starts — after indentation and any
   * blockquote markers. A fresh line-type marker belongs here, so indented
   * and quoted lines keep their prefix. */
  contentFrom: number;
}

const HEADING = /^ATXHeading(\d)$/;

/** The slice of Lezer's SyntaxNode these lookups touch. */
type NodeLike = {
  readonly name: string;
  readonly from: number;
  readonly to: number;
  readonly parent: NodeLike | null;
  getChild(type: string): NodeLike | null;
};

/** Extend a mark's end over the single following space, when present. */
function withMarkerSpace(state: EditorState, to: number, lineTo: number): number {
  return to < lineTo && state.sliceDoc(to, to + 1) === " " ? to + 1 : to;
}

function firstNonWhitespace(state: EditorState, from: number, to: number): number {
  const text = state.sliceDoc(from, to);
  return from + (text.length - text.trimStart().length);
}

export function lineStructure(state: EditorState, line: Line): LineStructure {
  const result: LineStructure = {
    inCode: false,
    heading: null,
    list: null,
    quote: null,
    contentFrom: firstNonWhitespace(state, line.from, line.to),
  };

  const tree = syntaxTree(state);
  // Resolve at the first content character. Blockquote markers are container
  // prefixes, not content — step past each one (`> > - x` → resolve at `-`)
  // so the line's own structure is an ancestor of the resolve point.
  let node = tree.resolveInner(result.contentFrom, 1) as unknown as NodeLike;
  while (node.name === "QuoteMark" && node.from >= line.from) {
    result.quote ??= {
      markFrom: node.from,
      markTo: withMarkerSpace(state, node.to, line.to),
    };
    result.contentFrom = firstNonWhitespace(state, node.to, line.to);
    node = tree.resolveInner(result.contentFrom, 1) as unknown as NodeLike;
  }

  // Every structural fact about the resolve point is one of its ancestors.
  for (let cur: NodeLike | null = node; cur; cur = cur.parent) {
    const name = cur.name;
    if (name === "FencedCode" || name === "CodeBlock") {
      result.inCode = true;
      continue;
    }
    const heading = HEADING.exec(name);
    if (heading && cur.from >= line.from && cur.from <= result.contentFrom) {
      const mark = cur.getChild("HeaderMark");
      if (mark) {
        result.heading = {
          level: Number(heading[1]),
          markFrom: mark.from,
          markTo: withMarkerSpace(state, mark.to, line.to),
        };
      }
      continue;
    }
    // The innermost ListItem STARTING on this line owns the line's marker; an
    // item merely continuing here (wrapped paragraph) contributes nothing.
    if (name === "ListItem" && !result.list && cur.from >= line.from && cur.from <= line.to) {
      const mark = cur.getChild("ListMark");
      if (!mark || mark.from > line.to) continue;
      const taskMark = cur.getChild("Task")?.getChild("TaskMarker") ?? null;
      result.list = {
        kind: cur.parent?.name === "OrderedList" ? "ordered" : "bullet",
        task: Boolean(taskMark),
        markFrom: mark.from,
        markTo: withMarkerSpace(state, (taskMark ?? mark).to, line.to),
      };
    }
  }
  return result;
}
