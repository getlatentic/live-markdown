/**
 * Renders a table cell's inline markdown to an HTML string by walking the Lezer
 * inline nodes already parsed inside the `TableCell`, styled through the SAME
 * {@link NODE_RULES} the live editor uses: a `mark` paint becomes a `<span>`
 * carrying that rule's class (`cm-strong`, `cm-inline-code`, `cm-link`, …), so
 * a cell's bold/code/link is painted by the exact `.cm-*` theme rules as body
 * text — not a second, drifting set of styles. Hidden chrome drops out;
 * not-yet-styled constructs pass through as raw markdown, matching how the
 * body leaves them today. Cells render STRINGS, not DOM, so a `widget` paint
 * passes the node's raw source through (the cell's DOMPurify pass keeps
 * allow-listed inline HTML like `<br>` and drops the rest).
 *
 * Reading the parsed tree (rather than re-parsing the cell string) preserves
 * escaped pipes and leaves literal inline HTML (`<br>`) in the gaps between
 * nodes intact — the cell's DOMPurify pass (tableCell.ts) sanitises the result.
 */

import { type EditorState } from "@codemirror/state";

import { type NodeLike } from "./paint";
import { NODE_RULES } from "./registry";

type SyntaxNodeLike = {
  readonly name: string;
  readonly from: number;
  readonly to: number;
  readonly firstChild: SyntaxNodeLike | null;
  readonly nextSibling: SyntaxNodeLike | null;
};

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

/**
 * `InlineCode` content sits between its two `CodeMark` backtick children and is
 * literal — no nested markdown — so it's entity-escaped rather than recursed.
 */
function codeText(state: EditorState, node: SyntaxNodeLike): string {
  let innerFrom = node.from;
  let innerTo = node.to;
  let seenMark = false;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name !== "CodeMark") continue;
    if (!seenMark) {
      innerFrom = child.to;
      seenMark = true;
    }
    innerTo = child.from;
  }
  return state.sliceDoc(innerFrom, innerTo);
}

function renderLink(state: EditorState, node: SyntaxNodeLike, className: string): string {
  let url = "";
  let labelFrom = -1;
  let labelTo = -1;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === "URL") url = state.sliceDoc(child.from, child.to);
    else if (child.name === "LinkMark") {
      const mark = state.sliceDoc(child.from, child.to);
      if (mark === "[") labelFrom = child.to;
      else if (mark === "]" && labelTo < 0) labelTo = child.from;
    }
  }
  if (labelFrom < 0 || labelTo < 0) return state.sliceDoc(node.from, node.to);
  const label = renderRange(state, node, labelFrom, labelTo);
  // Keep the anchor — the widget's click handler routes a Cmd-click through to
  // the host opener — but carry `.cm-link` so it matches body links.
  return url
    ? `<a href="${escapeAttr(url)}" class="${className}">${label}</a>`
    : `<span class="${className}">${label}</span>`;
}

/** A registry `mark` node → `<span class="…">`, reusing the editor's own class. */
function renderMark(state: EditorState, node: SyntaxNodeLike, className: string): string {
  if (node.name === "InlineCode") {
    // Literal content between the backtick `CodeMark`s — entity-escaped, no recursion.
    return `<span class="${className}">${escapeText(codeText(state, node))}</span>`;
  }
  if (node.name === "Link") {
    return renderLink(state, node, className);
  }
  return `<span class="${className}">${renderRange(state, node, node.from, node.to)}</span>`;
}

function renderNode(state: EditorState, parent: SyntaxNodeLike, node: SyntaxNodeLike): string {
  const rule = NODE_RULES[node.name];
  // An unknown node (no rule) is emitted verbatim.
  if (!rule) return state.sliceDoc(node.from, node.to);
  const paint = rule({
    name: node.name,
    from: node.from,
    to: node.to,
    parentName: parent.name,
    node: node as unknown as NodeLike,
    state,
  });
  switch (paint.paint) {
    case "mark":
      return renderMark(state, node, paint.className);
    case "hide": {
      // Emit whatever the rule did NOT hide — "" for whole-node chrome
      // (`**`, `` ` ``, a Link's URL), the escaped character for `\x`.
      const hidden = paint.range ?? node;
      return state.sliceDoc(node.from, hidden.from) + state.sliceDoc(hidden.to, node.to);
    }
    case "widget":
      // Cells render strings, not DOM — the raw source passes through and
      // the cell's DOMPurify pass keeps allow-listed tags (`<br>`).
      return state.sliceDoc(node.from, node.to);
    default:
      // none / lineClass: recurse so nested styled marks still render, while
      // this node's own (unstyled) markup passes through as raw text.
      return renderRange(state, node, node.from, node.to);
  }
}

/**
 * Render `parent`'s inline content clipped to `[from, to)`: each child node
 * becomes its tag, and the un-tokenised text in the gaps between children
 * (plain text, inline HTML) is emitted verbatim.
 */
function renderRange(
  state: EditorState,
  parent: SyntaxNodeLike,
  from: number,
  to: number,
): string {
  let html = "";
  let pos = from;
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    if (child.to <= from || child.from >= to) continue;
    if (child.from > pos) html += state.sliceDoc(pos, child.from);
    html += renderNode(state, parent, child);
    pos = child.to;
  }
  if (pos < to) html += state.sliceDoc(pos, to);
  return html;
}

/** Inline-render one `TableCell` node to a (still-to-be-sanitised) HTML string. */
export function renderInlineCell(state: EditorState, cell: SyntaxNodeLike): string {
  return renderRange(state, cell, cell.from, cell.to).trim();
}
