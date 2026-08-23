import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";

/**
 * How long a structural lookup may spend parsing. It runs inside a keystroke,
 * so this is a budget rather than a guarantee: past it we answer from whatever
 * has been parsed, exactly as before.
 */
const PARSE_BUDGET_MS = 50;

/**
 * A syntax tree that reaches `pos`.
 *
 * `syntaxTree` returns only what the **viewport** has driven the parser
 * through, so `resolveInner` past that point reports the position as bare
 * `Document`. Every command that asks "am I inside a list / a fence / a table?"
 * then gets "no" and takes the plain-text path: a wrong answer, not a slow one.
 *
 * Measured in WebKit, the engine we ship on, with real layout — two regimes.
 *
 * On the frame a document opens the parser has covered a few thousand
 * characters: 3,009 of 7,902, viewport 0–331, for an editor 11,404px tall. The
 * idle parse then catches up within about half a second, so near the viewport
 * this is a race — and it heals before a hand-test can see it.
 *
 * Further out it never heals. The idle parse stops 100,000 characters past the
 * viewport: the tree plateaus at 100,739 for a 167k-character document and a
 * 341k one alike, and stays there. `ensureSyntaxTree` resumes from that plateau
 * and finishes the 341k document in 43ms — inside the budget above.
 *
 * Only for questions about a *position*. Decoration plugins iterate
 * `view.visibleRanges` and should keep using `syntaxTree` directly: there,
 * being limited to the viewport is the point.
 */
/// The tree type, named without importing `@lezer/common` — it is a transitive
/// dependency, and a declaration referring to it by pnpm path is not portable
/// for anyone consuming the built package.
type Tree = ReturnType<typeof syntaxTree>;

export function treeAt(state: EditorState, pos: number): Tree {
  return ensureSyntaxTree(state, pos + 1, PARSE_BUDGET_MS) ?? syntaxTree(state);
}
