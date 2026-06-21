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

export function previousVisiblePosition(view: EditorView, pos: number): number {
  if (pos <= 0) return 0;
  let p = pos - 1;
  while (p > 0) {
    const range = containingAtomic(view, p);
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
    const range = containingAtomic(view, p);
    if (range) p = range.to + 1;
    else return p;
  }
  return docLen;
}
