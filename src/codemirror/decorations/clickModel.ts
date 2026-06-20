/**
 * Click model — handles the mouse interactions spec 7 requires that
 * CM6 doesn't already do natively.
 *
 * The default CM6 click path is *good* for normal text clicks: it
 * computes a byte position via `posAtCoords`, handles padding past
 * EOL by snapping to line end, supports drag-select, double-click
 * to select word, triple-click to select line. We do **not** want
 * to fight any of that — every previous attempt to intercept
 * mousedown ate the first click in some case (lost focus, blocked
 * drag start, etc).
 *
 * So this handler narrows to the single interaction CM6 can't infer
 * for us: **Cmd / Ctrl-click on a link → open URL in browser**
 * (spec 7.4). Plain click on a link still places the caret in the
 * link text via CM6's default.
 *
 * Checkbox toggles (7.5), image selection (7.6), and table cell
 * editing (7.8) are widget-driven — they handle their own clicks
 * via the widget DOM, so they don't appear here.
 *
 * Caret-never-inside-hidden-marker (spec 6.3) is enforced by the
 * decoration plugin's atomic ranges; the click handler doesn't need
 * a snap-to-content fallback because hidden ranges are rendered
 * width-0 by `Decoration.replace`, so clicks visually can't land on
 * them. Trust the rendering.
 */

import { syntaxTree } from "@codemirror/language";
import { EditorSelection, Facet } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { parseWikilinkBody, resolveWikilinkTarget } from "../../links/wikilink";
import { openExternalUrlFacet } from "./hostFacets";
import { wikilinkFromPathFacet, wikilinkTargetsFacet } from "./wikilinkPlugin";

/**
 * Navigation callback registered by the editor's React shell. Routes a
 * clicked workspace-relative path back through `selectFile`.
 */
export const navigateToFacet = Facet.define<
  (path: string) => void,
  ((path: string) => void) | null
>({
  combine: (vals) => vals[0] ?? null,
});

/**
 * Walk up from a syntax node to find a `Link` ancestor and return
 * its URL — or `null` if the click wasn't on a link.
 */
export function linkUrlAt(view: EditorView, pos: number): string | null {
  const node = syntaxTree(view.state).resolveInner(pos, 1);
  let n: typeof node | null = node;
  while (n && n.name !== "Link") n = n.parent;
  if (!n) return null;
  const urlNode = n.node.getChild("URL");
  if (!urlNode) return null;
  return view.state.sliceDoc(urlNode.from, urlNode.to);
}

/**
 * If `pos` falls inside a `[[…]]` wikilink, return the workspace
 * file path it resolves to (or null if unresolved). Wikilinks are
 * detected via the same regex `wikilinkPlugin` uses; we re-scan the
 * current line at click time because the plugin doesn't expose its
 * matches.
 */
export function wikilinkTargetAt(view: EditorView, pos: number): string | null {
  const line = view.state.doc.lineAt(pos);
  const text = line.text;
  const re = /\[\[([^\]\n]+?)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const matchStart = line.from + m.index;
    const matchEnd = matchStart + m[0].length;
    if (pos < matchStart || pos > matchEnd) continue;
    const { target } = parseWikilinkBody(m[1] ?? "");
    if (!target) return null;
    const fromPath = view.state.facet(wikilinkFromPathFacet);
    const knownPaths = view.state.facet(wikilinkTargetsFacet);
    return resolveWikilinkTarget(target, { fromPath, knownPaths });
  }
  return null;
}

export const clickModel = EditorView.domEventHandlers({
  mousedown(event, view) {
    // Only intervene on Cmd/Ctrl-click — everything else stays
    // with CM6's default click path so focus + drag-select + EOL
    // snapping all keep working.
    if (event.button !== 0) return false;
    if (!(event.metaKey || event.ctrlKey)) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) return false;
    const url = linkUrlAt(view, pos);
    if (url) {
      event.preventDefault();
      view.state.facet(openExternalUrlFacet)(url);
      return true;
    }
    // Wikilink? Resolve target via the registered navigation callback.
    const target = wikilinkTargetAt(view, pos);
    if (target) {
      const navigate = view.state.facet(navigateToFacet);
      if (navigate) {
        event.preventDefault();
        navigate(target);
        return true;
      }
    }
    return false;
  },
  contextmenu(event, view) {
    // Right-click → select the word under the pointer and let the
    // selection comment bubble surface its menu. Spec section 7.4
    // (comment context menu on highlight) is the same UX whether
    // the user dragged a selection or right-clicked — both produce
    // a non-empty selection so the bubble appears.
    //
    // If the user has an existing selection that covers the click,
    // leave it as-is; otherwise expand the click position to the
    // word boundary.
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) return false;
    const current = view.state.selection.main;
    if (!current.empty && pos >= current.from && pos <= current.to) {
      // Existing selection covers the click — no need to re-select.
      return false;
    }
    const wordRange = view.state.wordAt(pos);
    if (!wordRange || wordRange.from === wordRange.to) return false;
    event.preventDefault();
    view.dispatch({
      selection: EditorSelection.range(wordRange.from, wordRange.to),
      userEvent: "select.pointer",
    });
    return true;
  },
});
