/**
 * Keep typed whitespace from dissolving emphasis (#94).
 *
 * CommonMark's flanking rules make a closing `**`/`*`/`~~` delimiter literal
 * when preceded by whitespace (and an opening one when followed by it). The
 * caret's resting position at a bold word's end is INSIDE the construct —
 * before the hidden closing marker — so typing a space there writes
 * `**Compose **`, the delimiters stop parsing, and the raw markers appear in
 * rich mode.
 *
 * Whitespace typed at a flanking-sensitive construct's content edge belongs
 * OUTSIDE its markers: `**Compose** ` / ` **Compose**`. This filter re-sites
 * such insertions; everything else passes through untouched. Inline code is
 * exempt — code spans have no flanking rule and edge spaces are meaningful.
 */

import { EditorSelection, EditorState, type Transaction } from "@codemirror/state";
import { treeAt } from "../core/treeAt";

const FLANKING_SENSITIVE = new Set(["StrongEmphasis", "Emphasis", "Strikethrough"]);
/** A line break at the edge of a code span would be part of the code. */
const BROKEN_BY_A_LINE_BREAK = new Set([...FLANKING_SENSITIVE, "InlineCode"]);

type NodeLike = {
  readonly name: string;
  readonly from: number;
  readonly to: number;
  readonly parent: NodeLike | null;
  readonly firstChild: NodeLike | null;
  readonly lastChild: NodeLike | null;
};

/** Where a whitespace insertion at `pos` must land so no construct's
 * delimiter is invalidated — hopping outward through nested constructs
 * (`***x***` needs two hops). Returns `pos` itself when it isn't at a
 * flanking-sensitive content edge. */
function siteOutsideFlanking(state: EditorState, pos: number, side: "end" | "start", constructs = FLANKING_SENSITIVE): number {
  for (;;) {
    // Re-acquired each hop: `pos` moves outward to an enclosing node's edge,
    // which can sit past what the previous round parsed.
    const tree = treeAt(state, pos);
    let node = tree.resolveInner(pos, side === "end" ? -1 : 1) as unknown as NodeLike | null;
    let moved = false;
    for (; node; node = node.parent) {
      if (!constructs.has(node.name)) continue;
      const mark = side === "end" ? node.lastChild : node.firstChild;
      const boundary = side === "end" ? mark?.from : mark?.to;
      if (boundary === pos) {
        pos = side === "end" ? node.to : node.from;
        moved = true;
        break;
      }
    }
    if (!moved) return pos;
  }
}

/**
 * Where a line break at `pos` must go. At the edge of styled text, inside
 * its markers, the break would leave a marker at the end of one line or the
 * start of the next: emphasis stops parsing there, and a lone `*` in front
 * of a space starts a list. The break goes outside the markers.
 */
export function lineBreakSite(state: EditorState, pos: number): number {
  const end = siteOutsideFlanking(state, pos, "end", BROKEN_BY_A_LINE_BREAK);
  return end !== pos ? end : siteOutsideFlanking(state, pos, "start", BROKEN_BY_A_LINE_BREAK);
}

export const flankingGuard = EditorState.transactionFilter.of((tr: Transaction) => {
  if (!tr.docChanged || !tr.isUserEvent("input.type") || tr.isUserEvent("input.type.compose")) {
    return tr;
  }
  // Exactly one pure insertion of whitespace — a keystroke, not a wrap/paste.
  let insertion: { from: number; text: string } | null = null;
  let eligible = true;
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    if (insertion || fromA !== toA || !/^\s+$/.test(inserted.toString())) eligible = false;
    else insertion = { from: fromA, text: inserted.toString() };
  });
  if (!eligible || !insertion) return tr;
  const { from, text } = insertion as { from: number; text: string };

  const end = siteOutsideFlanking(tr.startState, from, "end");
  const resited = end !== from ? end : siteOutsideFlanking(tr.startState, from, "start");
  if (resited === from) return tr;

  return {
    changes: { from: resited, insert: text },
    selection: EditorSelection.cursor(resited + text.length),
    userEvent: "input.type",
    scrollIntoView: true,
  };
});
