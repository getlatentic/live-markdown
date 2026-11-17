/**
 * Does a bracketed span actually link anywhere?
 *
 * Lezer emits a `Link` node for EVERY `[…]` it sees, resolved or not. CommonMark
 * makes `[label]` a link only when the document also carries a matching
 * `[label]: url` definition, and the parser leaves that lookup to its consumer —
 * so "there is a Link node here" is not the same claim as "this is a link".
 *
 * Treating the two as one hid the brackets out of ordinary prose: `arr[0]` drew
 * as `arr0`, `see [3]` as `see 3`, and every optional argument in a pasted LaTeX
 * block vanished (`\begin{tikzpicture}[scale=0.42]` → `\begin{tikzpicture}scale=0.42`).
 * The document was intact; only the rendering lied, which is the worse failure —
 * nothing looked broken enough to report.
 */

import { type EditorState } from "@codemirror/state";

import { docTree } from "./codeContext";
import { type NodeLike } from "./paint";

/** Block containers a `[label]: url` definition can sit inside. Inline nodes are
 *  not descended into — a definition is a block construct, so stopping at the
 *  paragraph level turns the scan below from O(nodes) into O(blocks). */
const DEFINITION_CONTAINERS = new Set([
  "Document",
  "Blockquote",
  "BulletList",
  "OrderedList",
  "ListItem",
]);

/** CommonMark label matching: case-folded, whitespace-collapsed, trimmed. */
function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

/** A `LinkLabel` node's text without its enclosing brackets. */
function labelInner(state: EditorState, label: NodeLike): string {
  return state.sliceDoc(label.from + 1, label.to - 1);
}

const definedLabels = new WeakMap<EditorState, ReadonlySet<string>>();

/** Every label the document defines. Cached per state — a rule runs once per
 *  painted node, and each state is scanned at most once. */
function definitions(state: EditorState): ReadonlySet<string> {
  const cached = definedLabels.get(state);
  if (cached) return cached;
  const labels = new Set<string>();
  docTree(state).iterate({
    enter: (node) => {
      if (node.name !== "LinkReference") return DEFINITION_CONTAINERS.has(node.name);
      const label = node.node.getChild("LinkLabel");
      if (label) labels.add(normalizeLabel(labelInner(state, label)));
      return false;
    },
  });
  definedLabels.set(state, labels);
  return labels;
}

/** The text between a link's own `[` and `]` marks, or null when it has none. */
function ownLabel(state: EditorState, link: NodeLike): string | null {
  let open: NodeLike | null = null;
  let close: NodeLike | null = null;
  for (let child = link.firstChild; child; child = child.nextSibling) {
    if (child.name !== "LinkMark") continue;
    const mark = state.sliceDoc(child.from, child.to);
    if (mark === "[" && !open) open = child;
    else if (mark === "]" && !close) close = child;
  }
  if (!open || !close || close.from <= open.to) return null;
  return state.sliceDoc(open.to, close.from);
}

/**
 * Does this `Link` render as a link — or as the literal brackets the author typed?
 *
 * True for an inline `[text](url)`, and for a reference link whose label the
 * document defines. False for the shortcut form with nothing to resolve against,
 * which is most `[…]` in prose.
 */
export function linkResolves(link: NodeLike, state: EditorState): boolean {
  if (link.getChild("URL")) return true;
  const reference = link.getChild("LinkLabel");
  const explicit = reference ? labelInner(state, reference) : "";
  // Collapsed `[text][]` and shortcut `[text]` both resolve on their own label.
  const key = explicit.trim() === "" ? (ownLabel(state, link) ?? "") : explicit;
  return key.trim() !== "" && definitions(state).has(normalizeLabel(key));
}

/**
 * Does the link render any visible label text? Whitespace-only counts as
 * invisible — for `[](url)` / `[ ](url)` the URL is the link's entire visible
 * content, and hiding it (with the marks already hidden) left an invisible,
 * unclickable dead zone.
 */
export function linkHasVisibleLabel(link: NodeLike, state: EditorState): boolean {
  return (ownLabel(state, link) ?? "").trim() !== "";
}
