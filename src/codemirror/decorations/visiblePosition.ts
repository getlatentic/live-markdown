/**
 * Visible-position navigation across hidden, atomic ranges.
 *
 * In Rich Edit Mode the caret may never land *inside* an atomic range — a
 * hidden inline marker (`**`, `[`, `` ` ``, …) or a whole table's `| … |` block
 * source. These helpers return the next / previous position that sits outside
 * every atomic range, so the arrow keys and the delete normalizer step *over* a
 * table the same way they step over an inline marker instead of walking into
 * its hidden source.
 *
 * Two atomic sources are consulted together: the decoration plugin's inline
 * ranges and the table field's block ranges. (The table also registers with
 * CM6's `EditorView.atomicRanges` facet, but that only governs CM6's *default*
 * commands — our `Prec.high` arrow/delete handlers run instead, so they have to
 * consult the table themselves or they march straight through the grid source.)
 *
 * "Inside" is strict: a position at a range's `from` or `to` is a boundary the
 * caret may rest on, not inside it.
 */

import { findClusterBreak } from "@codemirror/state";
import { type EditorView } from "@codemirror/view";

import { markdownDecorationsPlugin } from "./plugin";
import { tableField } from "./tableField";

type RangeQueryable = {
  between(from: number, to: number, f: (from: number, to: number) => void | false): void;
};

/** The atomic range strictly containing `p` (inline marker or table), or null. */
function containingAtomic(view: EditorView, p: number): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null;
  const scan = (set: RangeQueryable | null | undefined): void => {
    if (found || !set) return;
    set.between(p, p, (from, to) => {
      if (from < p && p < to) {
        found = { from, to };
        return false;
      }
    });
  };
  scan(view.plugin(markdownDecorationsPlugin)?.atomic);
  scan(view.state.field(tableField, false));
  return found;
}

/**
 * A table whose far edge sits exactly at `p` in the direction of travel — its
 * `to` when stepping backward, its `from` when stepping forward. Block widgets
 * paint position `to` on the blank line just past the table (and `from` on the
 * line just before), so resting the caret there looks identical to the adjacent
 * line — a press that seems to do nothing. Treat the edge like the inside of the
 * table and step over the whole grid, so the caret moves through it in one key.
 */
function tableEdgeAt(
  view: EditorView,
  p: number,
  dir: "backward" | "forward",
): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null;
  view.state.field(tableField, false)?.between(p, p, (from, to) => {
    if (dir === "backward" ? to === p : from === p) {
      found = { from, to };
      return false;
    }
  });
  return found;
}

/** The atomic range whose far edge sits exactly at `p` on the given side —
 *  the trailing edge when looking backward, the leading edge when forward. */
function atomicTouching(
  view: EditorView,
  p: number,
  side: "before" | "after",
): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null;
  const scan = (set: RangeQueryable | null | undefined): void => {
    if (found || !set) return;
    set.between(p, p, (from, to) => {
      if (from === to) return; // zero-length ranges aren't skippable content
      if (side === "before" ? to === p : from === p) {
        found = { from, to };
        return false;
      }
    });
  };
  scan(view.plugin(markdownDecorationsPlugin)?.atomic);
  scan(view.state.field(tableField, false));
  return found;
}

/**
 * The visible grapheme immediately before/after `pos` as a deletable source
 * range, skipping any hidden markers between it and the caret — or null at the
 * document edge. Unlike {@link previousVisiblePosition} (a caret MOTION stop),
 * this never folds a marker into the range: deleting it removes exactly one
 * visible character, so `**Compose**` backspaced from either side of its
 * hidden closing `**` becomes `**Compos**`, never raw `**Compos`. A newline
 * counts as the adjacent char — callers treat that as a line-join.
 */
export function visibleCharBefore(
  view: EditorView,
  pos: number,
): { from: number; to: number } | null {
  let e = pos;
  for (;;) {
    const range = containingAtomic(view, e) ?? atomicTouching(view, e, "before");
    if (!range) break;
    e = range.from;
  }
  if (e <= 0) return null;
  const line = view.state.doc.lineAt(e);
  if (e === line.from) return { from: e - 1, to: e };
  return { from: line.from + findClusterBreak(line.text, e - line.from, false), to: e };
}

export function visibleCharAfter(
  view: EditorView,
  pos: number,
): { from: number; to: number } | null {
  const docLen = view.state.doc.length;
  let s = pos;
  for (;;) {
    const range = containingAtomic(view, s) ?? atomicTouching(view, s, "after");
    if (!range) break;
    s = range.to;
  }
  if (s >= docLen) return null;
  const line = view.state.doc.lineAt(s);
  if (s === line.to) return { from: s, to: s + 1 };
  return { from: s, to: line.from + findClusterBreak(line.text, s - line.from, true) };
}

export function previousVisiblePosition(view: EditorView, pos: number): number {
  if (pos <= 0) return 0;
  let p = pos - 1;
  while (p > 0) {
    const range = containingAtomic(view, p) ?? tableEdgeAt(view, p, "backward");
    if (range) p = range.from - 1;
    else return p;
  }
  return 0;
}

export function nextVisiblePosition(view: EditorView, pos: number): number {
  const docLen = view.state.doc.length;
  if (pos >= docLen) return docLen;
  let p = pos + 1;
  while (p < docLen) {
    const range = containingAtomic(view, p) ?? tableEdgeAt(view, p, "forward");
    if (range) p = range.to + 1;
    else return p;
  }
  return docLen;
}
