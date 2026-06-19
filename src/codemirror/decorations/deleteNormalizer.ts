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

import { markdownDecorationsPlugin } from "./plugin";

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

function previousVisiblePosition(view: EditorView, pos: number): number {
  if (pos <= 0) return 0;
  const atomic = view.plugin(markdownDecorationsPlugin)?.atomic;
  if (!atomic) return pos - 1;
  let p = pos - 1;
  // Strict inside-check — see cursorModel.ts for the rationale.
  while (p > 0) {
    let containingFrom = -1;
    atomic.between(p, p, (from, to) => {
      if (from < p && p < to) {
        containingFrom = from;
        return false;
      }
    });
    if (containingFrom >= 0) {
      p = containingFrom - 1;
    } else {
      return p;
    }
  }
  return 0;
}

function nextVisiblePosition(view: EditorView, pos: number): number {
  const docLen = view.state.doc.length;
  if (pos >= docLen) return docLen;
  const atomic = view.plugin(markdownDecorationsPlugin)?.atomic;
  if (!atomic) return pos + 1;
  let p = pos + 1;
  while (p < docLen) {
    let containingTo = -1;
    atomic.between(p, p, (from, to) => {
      if (from < p && p < to) {
        containingTo = to;
        return false;
      }
    });
    if (containingTo >= 0) {
      p = containingTo + 1;
    } else {
      return p;
    }
  }
  return docLen;
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

const visibleBackspace: Command = (view) => {
  const sel = view.state.selection.main;
  if (!sel.empty) {
    // Non-empty selection: delete it as a whole. Default backspace
    // works fine here; we explicitly mirror that to keep the userEvent
    // tagged consistently.
    return applyDeletion(view, sel.from, sel.to);
  }
  const pos = sel.head;
  if (pos === 0) return true;
  const from = previousVisiblePosition(view, pos);
  return applyDeletion(view, from, pos);
};

const visibleDeleteForward: Command = (view) => {
  const sel = view.state.selection.main;
  if (!sel.empty) {
    return applyDeletion(view, sel.from, sel.to);
  }
  const pos = sel.head;
  if (pos >= view.state.doc.length) return true;
  const to = nextVisiblePosition(view, pos);
  return applyDeletion(view, pos, to);
};

export const deleteNormalizerKeymap = Prec.high(
  keymap.of([
    { key: "Backspace", run: visibleBackspace },
    { key: "Delete", run: visibleDeleteForward },
  ]),
);
