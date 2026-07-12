/**
 * Rich copy/cut (#135): every copy writes BOTH clipboard flavors —
 *
 *   text/plain — the markdown SOURCE of the selection (lossless: editors,
 *                terminals, and Compose→Compose round trips);
 *   text/html  — the selection rendered by the host (Google Docs, Slack,
 *                Word, and Gmail paste it formatted).
 *
 * The HTML carries {@link COMPOSE_CLIPBOARD_ATTR} so our own paste handler
 * prefers the markdown flavor instead of re-converting our rendering.
 *
 * Stays out of the way of: the table surface's TSV cell-selection copy (a
 * capture-phase document listener that preventDefaults first), and CM's
 * native empty-selection behavior. Without a host renderer the handler still
 * runs — plain-only, but through one code path.
 */

import { EditorView } from "@codemirror/view";
import { Facet, type EditorState, type Extension } from "@codemirror/state";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";

import { COMPOSE_CLIPBOARD_ATTR } from "./htmlToMarkdown";

/** Host-supplied markdown → HTML renderer for clipboard writes. Null (the
 *  default) copies plain markdown only. Wired like the other host seams —
 *  see hostFacets.ts. */
export type RenderClipboardHtml = (markdown: string) => string | null;

export const renderClipboardHtmlFacet = Facet.define<
  RenderClipboardHtml | null,
  RenderClipboardHtml | null
>({
  combine: (values) => values[0] ?? null,
});

/** Inline constructs whose delimiters hide in rich mode. A selection made by
 *  eye starts at the first VISIBLE character — in source, that's just past
 *  the opening marker — so a naive slice ships an orphaned `**` (#140). */
const MARKER_PAIRED = new Set(["Emphasis", "StrongEmphasis", "Strikethrough", "InlineCode"]);

/**
 * Slice the selection as balanced markdown: when an edge lands inside a
 * marker-paired node, the missing delimiter is synthesized onto that edge —
 * copy what the user SAW (`**Priorties**`), not where the hidden markers
 * happened to fall. A mid-content selection (neither marker covered) stays a
 * plain slice; delimiter style (`*` vs `_`, `~~`, backticks) is preserved by
 * copying the node's actual mark text.
 */
export function balancedSlice(state: EditorState, from: number, to: number): string {
  // The copy may reach beyond the parsed region; give the parser a short
  // budget and fall back to the partial tree (worst case: today's slice).
  const tree = ensureSyntaxTree(state, to, 50) ?? syntaxTree(state);
  let prefix = "";
  let suffix = "";
  tree.iterate({
    from,
    to,
    enter: (node) => {
      if (!MARKER_PAIRED.has(node.name)) return;
      if (node.from >= from && node.to <= to) return false; // marks travel with the slice
      const first = node.node.firstChild;
      const last = node.node.lastChild;
      if (!first || !last || !first.name.endsWith("Mark") || !last.name.endsWith("Mark")) {
        return;
      }
      // An edge landing in the CONTENT region (between the marks) gets that
      // side's marker synthesized. Each edge repairs independently: the
      // screen shows the selected span formatted, so the copy carries the
      // formatting even when both marks fall outside the selection. An edge
      // inside a marker itself (raw-mode oddity) is left exactly as sliced.
      const contentStart = first.to;
      const contentEnd = last.from;
      // Outer nodes visit first: opening repairs append (outer→inner order),
      // closing repairs prepend (inner→outer), so nesting stays well-formed.
      if (from >= contentStart && from < contentEnd) {
        prefix = prefix + state.sliceDoc(first.from, first.to);
      }
      if (to > contentStart && to <= contentEnd) {
        suffix = state.sliceDoc(last.from, last.to) + suffix;
      }
    },
  });
  return prefix + state.sliceDoc(from, to) + suffix;
}

function handleClipboard(event: ClipboardEvent, view: EditorView, cut: boolean): boolean {
  if (event.defaultPrevented) return false;
  const data = event.clipboardData;
  if (!data) return false;
  const ranges = view.state.selection.ranges.filter((range) => !range.empty);
  if (ranges.length === 0) return false;

  const markdown = ranges
    .map((range) => balancedSlice(view.state, range.from, range.to))
    .join(view.state.lineBreak);
  data.setData("text/plain", markdown);
  const render = view.state.facet(renderClipboardHtmlFacet);
  const html = render?.(markdown);
  if (html) {
    data.setData("text/html", `<div ${COMPOSE_CLIPBOARD_ATTR}="true">${html}</div>`);
  }
  event.preventDefault();

  if (cut && !view.state.readOnly) {
    view.dispatch(view.state.replaceSelection(""), {
      userEvent: "delete.cut",
      scrollIntoView: true,
    });
  }
  return true;
}

/** The copy half of clipboard interop. */
export const richCopy: Extension = EditorView.domEventHandlers({
  copy(event, view) {
    return handleClipboard(event, view, false);
  },
  cut(event, view) {
    return handleClipboard(event, view, true);
  },
});
