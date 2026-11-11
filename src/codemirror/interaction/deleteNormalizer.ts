/**
 * Backspace / Delete normalizer — spec section 8.2 and 8.3.
 *
 * Two invariants this enforces:
 *
 *   1. **Backspace deletes visible content first.** Hidden markdown
 *      markers are never the unit of deletion in Rich Edit Mode.
 *      So pressing backspace at the end of `**bold**` removes the
 *      `d` (turning the source into `**bol**`), not the closing `**`.
 *
 *   2. **Empty styled spans collapse entirely.** If a backspace
 *      would leave a span with no content (e.g. backspace inside
 *      `**X**` where `X` is the only char), we delete the entire
 *      construct — markers and all — instead of leaving dangling
 *      `****` / `[]()` / ` `` ` behind.
 *
 * The same rules apply forward for Delete.
 *
 * Constructs we normalise:
 *
 *   * `StrongEmphasis` (`**…**`)
 *   * `Emphasis` (`*…*` / `_…_`)
 *   * `InlineCode` (`` `…` ``)
 *   * `Link` (`[…](…)`)
 *   * `Strikethrough` (`~~…~~`)
 *
 * Each is identified by Lezer's node name; the content range is
 * `firstChild.to .. lastChild.from`.
 */

import { EditorSelection, Prec, type ChangeSpec } from "@codemirror/state";
import { type Command, EditorView, keymap } from "@codemirror/view";

import { fenceBackspaceGuard, fenceDeleteGuard } from "../code/fenceDeleteGuards";
import { lineStructure } from "../core/lineStructure";
import { openNumberRange } from "../list/numberEditing";
import { setArmedTable } from "../table/tableArmed";
import { tableField } from "../table/tableField";
import { backspaceAtLineStart } from "./lineStartBackspace";
import { visibleCharAfter, visibleCharBefore } from "./visiblePosition";
import { treeAt } from "../core/treeAt";

// Lezer's SyntaxNode type isn't directly exposed via @codemirror/language's
// public types and `@lezer/common` is a transitive dep. The structural
// shape we use is small enough to inline rather than pull a new direct
// dependency just for the type.
type SyntaxNodeLike = {
  readonly name: string;
  readonly from: number;
  readonly to: number;
  readonly parent: SyntaxNodeLike | null;
  readonly firstChild: SyntaxNodeLike | null;
  readonly lastChild: SyntaxNodeLike | null;
  readonly nextSibling: SyntaxNodeLike | null;
};

const COLLAPSIBLE_SPAN_NAMES = new Set([
  "StrongEmphasis",
  "Emphasis",
  "InlineCode",
  "Link",
  "Strikethrough",
]);

/**
 * Length of a line's leading **block** prefix — the list marker (`- `, `* `,
 * `1. `), ATX heading marker (`## `), and/or blockquote marker (`> `), including
 * nesting/indentation. Everything after is **inline** content (which may begin
 * with hidden inline markers like `**`). Used to line-join without eating inline
 * markers: backspacing at the visible start of `- **B**` deletes the newline +
 * `- ` but keeps `**B**`. Pure (operates on the line text) so it's unit-testable
 * without an `EditorView`.
 */
export function blockPrefixLength(lineText: string): number {
  const match = lineText.match(/^(?:\s*(?:[-*+]|\d+[.)])\s+|#{1,6}\s+|>\s?)+/);
  return match ? match[0].length : 0;
}

/**
 * If the planned deletion `[from, to]` would empty (or already empties)
 * a collapsible styled span, return the span's full source range
 * (markers included). Otherwise return `null`.
 */
function findCollapsibleSpan(
  view: EditorView,
  from: number,
  to: number,
): { from: number; to: number } | null {
  const tree = treeAt(view.state, to);
  // Walk up from the deletion's left edge.
  let node: SyntaxNodeLike | null = tree.resolveInner(from, 1) as unknown as SyntaxNodeLike;
  while (node) {
    if (COLLAPSIBLE_SPAN_NAMES.has(node.name)) {
      const first = node.firstChild;
      const last = closingMark(node);
      if (first && last && first !== last) {
        const contentStart = first.to;
        const contentEnd = last.from;
        // Remaining content after deletion =
        //   [contentStart, from) ∪ [to, contentEnd)
        // span collapses if both halves are empty.
        const leftKept = Math.max(0, from - contentStart);
        const rightKept = Math.max(0, contentEnd - to);
        if (leftKept === 0 && rightKept === 0) {
          return { from: node.from, to: node.to };
        }
      }
      // Stop at the first collapsible match — outer spans aren't
      // affected by inner-content deletes.
      break;
    }
    node = node.parent;
  }
  return null;
}

/** The mark that closes a span's content: a link's `]`, since its address
 *  follows the text; any other span's last child. */
function closingMark(span: SyntaxNodeLike): SyntaxNodeLike | null {
  if (span.name !== "Link") return span.lastChild;
  for (let child = span.firstChild?.nextSibling ?? null; child; child = child.nextSibling) {
    if (child.name === "LinkMark") return child;
  }
  return span.lastChild;
}

export interface TextRange {
  from: number;
  to: number;
}

/** `ranges` in order, with any that touch or overlap made one. */
function merged(ranges: readonly TextRange[]): TextRange[] {
  const out: TextRange[] = [];
  for (const range of [...ranges].sort((a, b) => a.from - b.from)) {
    const last = out[out.length - 1];
    if (last && range.from <= last.to) last.to = Math.max(last.to, range.to);
    else out.push({ ...range });
  }
  return out;
}

/** Each range widened over the styled span it empties (§8.3), until none
 *  widens further: emptying an inner span can empty the one around it. */
function withEmptiedSpans(view: EditorView, ranges: readonly TextRange[]): TextRange[] {
  let current = merged(ranges);
  for (;;) {
    const widened = merged(
      current.map((range) => {
        const span = findCollapsibleSpan(view, range.from, range.to);
        return span ? { from: Math.min(range.from, span.from), to: Math.max(range.to, span.to) } : range;
      }),
    );
    const settled = widened.length === current.length && widened.every((range, i) => range.from === current[i].from && range.to === current[i].to);
    if (settled) return widened;
    current = widened;
  }
}

/**
 * Delete runs of visible text in one edit. A span a run empties goes whole,
 * markers and all, along with the rest of what was asked. The caret ends
 * where the text nearest it stood: the last run's start going backward, the
 * first's going forward.
 */
export function deleteVisible(view: EditorView, ranges: readonly TextRange[], direction: "backward" | "forward"): boolean {
  const deletions = withEmptiedSpans(view, ranges.filter((range) => range.from < range.to));
  if (deletions.length === 0) return true;
  const changes = view.state.changes(deletions.map((range): ChangeSpec => ({ ...range, insert: "" })));
  const nearest = direction === "backward" ? deletions[deletions.length - 1] : deletions[0];
  view.dispatch({
    changes,
    selection: EditorSelection.cursor(changes.mapPos(nearest.from, -1)),
    userEvent: `delete.${direction}`,
    scrollIntoView: true,
  });
  return true;
}

function applyDeletion(view: EditorView, from: number, to: number): boolean {
  return deleteVisible(view, [{ from, to }], from < view.state.selection.main.head ? "backward" : "forward");
}

/** The table whose source ends just before `pos` (only whitespace between), or
 *  null — so Backspace can treat a table as one atomic block rather than edit
 *  its hidden `| … |` source. */
function tableBefore(view: EditorView, pos: number): { from: number; to: number } | null {
  let p = pos;
  while (p > 0 && /\s/.test(view.state.doc.sliceString(p - 1, p))) p--;
  let found: { from: number; to: number } | null = null;
  view.state.field(tableField, false)?.between(p, p, (from, to) => {
    if (to === p) {
      found = { from, to };
      return false;
    }
  });
  return found;
}

/** The table whose source starts just after `pos` (only whitespace between). */
function tableAfter(view: EditorView, pos: number): { from: number; to: number } | null {
  const docLen = view.state.doc.length;
  let p = pos;
  while (p < docLen && /\s/.test(view.state.doc.sliceString(p, p + 1))) p++;
  let found: { from: number; to: number } | null = null;
  view.state.field(tableField, false)?.between(p, p, (from, to) => {
    if (from === p) {
      found = { from, to };
      return false;
    }
  });
  return found;
}

/**
 * Two-press table delete (Zettlr-style). When the caret reaches a table from
 * the line below/above, the first press parks the caret at the table's `edge`
 * — a visible caret sitting just past the table, NOT a selection — and the
 * second press (caret now AT that edge) removes the whole table. Never edits
 * the hidden `| … |` source.
 */
function tableDeleteStep(
  view: EditorView,
  table: { from: number; to: number },
  pos: number,
  edge: number,
): boolean {
  if (pos === edge) {
    return applyDeletion(view, table.from, table.to);
  }
  view.dispatch({
    selection: EditorSelection.cursor(edge),
    effects: setArmedTable.of({ from: table.from, edge: edge === table.to ? "end" : "start" }),
    userEvent: "select",
    scrollIntoView: true,
  });
  return true;
}

export const visibleBackspace: Command = (view) => {
  const sel = view.state.selection.main;
  if (!sel.empty) {
    // Non-empty selection: delete it as a whole. Default backspace
    // works fine here; we explicitly mirror that to keep the userEvent
    // tagged consistently.
    return applyDeletion(view, sel.from, sel.to);
  }
  const pos = sel.head;
  if (pos === 0) return true;
  // The unit of deletion is the visible grapheme left of the caret — never a
  // hidden marker, and never marker + char folded together (the caret can rest
  // on either side of a hidden closing `**`; both must delete just the char).
  // An ordered item's number open for editing is plain text: Backspace takes
  // one digit, and at its start joins the line above, like anywhere else.
  const number = openNumberRange(view.state);
  const ch = visibleCharBefore(view, pos);
  const line = view.state.doc.lineAt(pos);
  const structure = lineStructure(view.state, line);
  // Nothing VISIBLE stands between the caret and the start of the line's
  // content, wherever the caret sits among hidden ranges (I2).
  const contentStart = (structure.list ?? structure.heading)?.markTo ?? structure.contentFrom;
  const atLineStart = !number && (!ch || ch.to <= contentStart);
  // A table just before the caret → park the caret at its end (first press); a
  // second press, caret now at that end, removes it. Never edits hidden source.
  // A heading's hashes are not text between it and the table above.
  const headingStart = atLineStart && structure.heading && !structure.list;
  const before = tableBefore(view, headingStart ? line.from : pos);
  if (before) return tableDeleteStep(view, before, pos, before.to);
  if (atLineStart && backspaceAtLineStart(view, pos, line, structure)) return true;
  if (!ch) return true; // nothing visible before the caret (doc/line 1 start)
  // The previous visible char is on an earlier line. This is a line-join, not
  // an inline delete: delete only the preceding newline + this line's block
  // prefix (a quote's `> `), leaving inline content and its hidden leading
  // markers (`**B**`) intact. List/heading markers were `backspaceAtLineStart`'s.
  if (ch.from < line.from && line.from > 0) {
    // Fence lines are structure: crossing one walls, parks, or collapses the
    // block instead of merging text into a fence (§12.1–.2).
    if (fenceBackspaceGuard(view, pos)) return true;
    const prefixLen = blockPrefixLength(view.state.doc.sliceString(line.from, line.to));
    return applyDeletion(view, line.from - 1, line.from + prefixLen);
  }
  return applyDeletion(view, ch.from, ch.to);
};

export const visibleDeleteForward: Command = (view) => {
  const sel = view.state.selection.main;
  if (!sel.empty) {
    return applyDeletion(view, sel.from, sel.to);
  }
  const pos = sel.head;
  const docLen = view.state.doc.length;
  if (pos >= docLen) return true;
  // Mirror of Backspace: a table just after the caret → park the caret at its
  // start (first press), then a second press removes it.
  const after = tableAfter(view, pos);
  if (after) return tableDeleteStep(view, after, pos, after.from);
  // The unit of deletion is the visible grapheme right of the caret — from a
  // line start this skips a hidden opening `**` and deletes the first letter,
  // never carving `**C` out of `**Compose**`.
  const ch = visibleCharAfter(view, pos);
  if (!ch) return true; // nothing visible after the caret
  const line = view.state.doc.lineAt(pos);
  // Forward-join — the mirror of backspace's line-join. The next visible char
  // is on a later line; delete only the newline + the next line's block
  // prefix, keeping inline markers on both sides.
  if (ch.from >= line.to && line.to < docLen) {
    if (fenceDeleteGuard(view, pos)) return true;
    const next = view.state.doc.lineAt(line.to + 1);
    const prefixLen = blockPrefixLength(view.state.doc.sliceString(next.from, next.to));
    return applyDeletion(view, line.to, next.from + prefixLen);
  }
  return applyDeletion(view, ch.from, ch.to);
};

export const deleteNormalizerKeymap = Prec.high(
  keymap.of([
    { key: "Backspace", run: visibleBackspace },
    { key: "Delete", run: visibleDeleteForward },
  ]),
);
