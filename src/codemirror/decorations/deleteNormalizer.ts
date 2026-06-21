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

import { syntaxTree } from "@codemirror/language";
import { EditorSelection, Prec, type ChangeSpec } from "@codemirror/state";
import { type Command, EditorView, keymap } from "@codemirror/view";

import { tableField } from "./tableField";
import { nextVisiblePosition, previousVisiblePosition } from "./visiblePosition";

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
  const tree = syntaxTree(view.state);
  // Walk up from the deletion's left edge.
  let node: SyntaxNodeLike | null = tree.resolveInner(from, 1) as unknown as SyntaxNodeLike;
  while (node) {
    if (COLLAPSIBLE_SPAN_NAMES.has(node.name)) {
      const first = node.firstChild;
      const last = node.lastChild;
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

function applyDeletion(view: EditorView, from: number, to: number): boolean {
  if (from === to) return true;
  const span = findCollapsibleSpan(view, from, to);
  let changes: ChangeSpec;
  let caret: number;
  if (span) {
    changes = { from: span.from, to: span.to, insert: "" };
    caret = span.from;
  } else {
    changes = { from, to, insert: "" };
    caret = from;
  }
  view.dispatch({
    changes,
    selection: EditorSelection.cursor(caret),
    userEvent: from < view.state.selection.main.head ? "delete.backward" : "delete.forward",
    scrollIntoView: true,
  });
  return true;
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
  // A table just before the caret → park the caret at its end (first press); a
  // second press, caret now at that end, removes it. Never edits hidden source.
  const before = tableBefore(view, pos);
  if (before) return tableDeleteStep(view, before, pos, before.to);
  const from = previousVisiblePosition(view, pos);
  const line = view.state.doc.lineAt(pos);
  // Caret at the visible start of its line — scanning back for the previous
  // visible char crossed into the previous line. This is a line-join, not an
  // inline delete: deleting [from, pos) here would eat THIS line's hidden
  // leading inline markers (the bug where backspacing in front of `- **B**`
  // deleted the `**`). Delete only the preceding newline + this line's block
  // prefix (bullet / heading / quote), leaving the inline content intact.
  if (from < line.from && line.from > 0) {
    const prefixLen = blockPrefixLength(view.state.doc.sliceString(line.from, line.to));
    return applyDeletion(view, line.from - 1, line.from + prefixLen);
  }
  return applyDeletion(view, from, pos);
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
  const to = nextVisiblePosition(view, pos);
  const line = view.state.doc.lineAt(pos);
  // Forward-join — the mirror of backspace's line-join. Caret at the visible end
  // of its line and the next visible char is on a later line. Deleting [pos, to)
  // would eat this line's trailing hidden markers and/or the next line's leading
  // ones (e.g. Delete at the end of `**A**` ate its closing `**`). Delete only
  // the newline + the next line's block prefix, keeping inline markers on both
  // sides.
  if (to > line.to && line.to < docLen) {
    const next = view.state.doc.lineAt(line.to + 1);
    const prefixLen = blockPrefixLength(view.state.doc.sliceString(next.from, next.to));
    return applyDeletion(view, line.to, next.from + prefixLen);
  }
  return applyDeletion(view, pos, to);
};

export const deleteNormalizerKeymap = Prec.high(
  keymap.of([
    { key: "Backspace", run: visibleBackspace },
    { key: "Delete", run: visibleDeleteForward },
  ]),
);
