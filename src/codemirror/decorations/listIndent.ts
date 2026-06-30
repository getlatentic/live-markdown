/**
 * List indent / outdent on Tab / Shift-Tab.
 *
 * Tab nests the current list item one level under its preceding sibling;
 * Shift-Tab promotes it one level. The step is the *parent's marker width*
 * (3 columns under `1. `, 2 under `- `), never a fixed unit — that's what lets
 * CommonMark parse the result as a real sublist; a naive two-space indent
 * mis-nests ordered items. A freshly nested ordered item is renumbered to `1`
 * so its sublist renders from one (the decoration plugin renumbers the rest by
 * position).
 *
 * Both commands are gated on the caret sitting in a list line, so anywhere else
 * — prose, a fenced code block — they return false and Tab keeps its normal
 * behaviour rather than hijacking focus or inserting a stray indent.
 */

import { syntaxTree } from "@codemirror/language";
import { type ChangeSpec, type EditorState, Prec } from "@codemirror/state";
import { type Command, EditorView, keymap } from "@codemirror/view";

interface ListMarker {
  /** Leading-space count. */
  indent: number;
  /** Marker plus its one trailing space: `- ` → 2, `12. ` → 4. */
  markerWidth: number;
  ordered: boolean;
}

const LIST_LINE = /^(\s*)([-*+] |\d+[.)] )/;

function listMarker(text: string): ListMarker | null {
  const m = LIST_LINE.exec(text);
  if (!m) return null;
  return { indent: m[1].length, markerWidth: m[2].length, ordered: /\d/.test(m[2]) };
}

/** A list line, but not one that's actually inside a fenced code block. */
function inListContext(state: EditorState, pos: number): boolean {
  if (!listMarker(state.doc.lineAt(pos).text)) return false;
  const cursor = syntaxTree(state).resolveInner(pos, -1).cursor();
  do {
    if (/Code/.test(cursor.name)) return false;
  } while (cursor.parent());
  return true;
}

/** The preceding sibling to nest under, or null when this is the first item at
 *  its level (nothing above to nest under) or the list breaks above. Blank
 *  lines — a loose list — are stepped over. */
function nestingParent(state: EditorState, lineNo: number, indent: number): ListMarker | null {
  for (let n = lineNo - 1; n >= 1; n--) {
    const text = state.doc.line(n).text;
    if (text.trim() === "") continue;
    const info = listMarker(text);
    if (!info) return null;
    if (info.indent === indent) return info;
    if (info.indent < indent) return null;
  }
  return null;
}

/** The nearest shallower list line; its indent is where an outdent lands. Null
 *  → outdent all the way to column 0. */
function outdentTarget(state: EditorState, lineNo: number, indent: number): ListMarker | null {
  for (let n = lineNo - 1; n >= 1; n--) {
    const text = state.doc.line(n).text;
    if (text.trim() === "") continue;
    const info = listMarker(text);
    if (!info) return null;
    if (info.indent < indent) return info;
  }
  return null;
}

function changeForLine(
  state: EditorState,
  lineNo: number,
  dir: "indent" | "outdent",
): ChangeSpec | null {
  const line = state.doc.line(lineNo);
  const info = listMarker(line.text);
  if (!info) return null;

  if (dir === "indent") {
    const parent = nestingParent(state, lineNo, info.indent);
    if (!parent) return null; // first item at its level — can't nest
    const newIndent = parent.indent + parent.markerWidth;
    if (newIndent <= info.indent) return null;
    if (info.ordered) {
      // Rewrite the indent and the leading number together so the new sublist
      // starts at `1`; the plugin renumbers any siblings by position.
      const digits = /^\d+/.exec(line.text.slice(info.indent))?.[0] ?? "";
      return {
        from: line.from,
        to: line.from + info.indent + digits.length,
        insert: " ".repeat(newIndent) + "1",
      };
    }
    return { from: line.from, insert: " ".repeat(newIndent - info.indent) };
  }

  if (info.indent === 0) return null; // top level — nothing to outdent
  const newIndent = outdentTarget(state, lineNo, info.indent)?.indent ?? 0;
  return { from: line.from, to: line.from + (info.indent - newIndent), insert: "" };
}

function changeListIndent(view: EditorView, dir: "indent" | "outdent"): boolean {
  const { state } = view;
  const range = state.selection.main;
  if (!inListContext(state, range.from)) return false;

  const changes: ChangeSpec[] = [];
  const firstLine = state.doc.lineAt(range.from).number;
  const lastLine = state.doc.lineAt(range.to).number;
  for (let n = firstLine; n <= lastLine; n++) {
    const change = changeForLine(state, n, dir);
    if (change) changes.push(change);
  }
  // Still consume Tab inside a list when nothing moves (first item, or top-level
  // outdent), so it never drops a literal tab into the list.
  if (changes.length === 0) return true;

  view.dispatch({
    changes,
    scrollIntoView: true,
    userEvent: dir === "indent" ? "input.indent" : "delete.dedent",
  });
  return true;
}

export const indentListItem: Command = (view) => changeListIndent(view, "indent");
export const outdentListItem: Command = (view) => changeListIndent(view, "outdent");

export const listIndentKeymap = Prec.highest(
  keymap.of([
    { key: "Tab", run: indentListItem },
    { key: "Shift-Tab", run: outdentListItem },
  ]),
);
