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
import { Facet, type Extension } from "@codemirror/state";

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

function handleClipboard(event: ClipboardEvent, view: EditorView, cut: boolean): boolean {
  if (event.defaultPrevented) return false;
  const data = event.clipboardData;
  if (!data) return false;
  const ranges = view.state.selection.ranges.filter((range) => !range.empty);
  if (ranges.length === 0) return false;

  const markdown = ranges
    .map((range) => view.state.sliceDoc(range.from, range.to))
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
