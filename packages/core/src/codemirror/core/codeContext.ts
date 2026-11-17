/**
 * Grammar-level code-context test for the regex-scanning inline plugins
 * (wikilink, highlight, footnote, math). Lezer emits no nodes for those
 * constructs, so the plugins scan raw text — but code is literal, and the
 * scans must skip it, exactly as the export pre-pass does (`protected_regions`
 * in `src-tauri/src/export/html.rs`, derived from comrak's parse).
 *
 * A plugin guards a match by its OPENER and CLOSER positions: either sitting
 * in code disqualifies the match, while a code span strictly inside the body
 * (`[[a `b` c]]`) does not — the same rule the export applies.
 */

import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

type Tree = ReturnType<typeof syntaxTree>;

/** The slice of Lezer's SyntaxNode the ancestor walk touches. */
type NodeLike = { readonly name: string; readonly parent: NodeLike | null };

const CODE_NODES = new Set(["FencedCode", "CodeBlock", "InlineCode"]);

/** The tree parsed through the viewport — the painter's forced-parse bound
 * (see `plugin.ts`), so a just-typed fence is already in the tree when a
 * viewport-scanning plugin consults the guard. */
export function viewportTree(view: EditorView): Tree {
  return ensureSyntaxTree(view.state, view.viewport.to, 100) ?? syntaxTree(view.state);
}

/** The tree parsed through the whole document, for doc-wide state-level scans
 * (math). Falls back to the partial tree when the parse budget runs out —
 * the guard then degrades to the unguarded behavior past the parse frontier. */
export function docTree(state: EditorState): Tree {
  return ensureSyntaxTree(state, state.doc.length, 20) ?? syntaxTree(state);
}

/** Whether the character at `pos` is code — inside a fenced or indented code
 * block or an inline code span. `resolveInner` descends into a fence's nested
 * `codeLanguages` parse; the parent walk crosses back into the markdown tree,
 * so the enclosing FencedCode still answers. */
export function inCode(tree: Tree, pos: number): boolean {
  let node = tree.resolveInner(pos, 1) as unknown as NodeLike | null;
  for (; node; node = node.parent) {
    if (CODE_NODES.has(node.name)) return true;
  }
  return false;
}
