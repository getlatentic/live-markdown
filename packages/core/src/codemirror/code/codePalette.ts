/**
 * The one code-syntax palette (One Light values — ADR 0002), consumed by both
 * renderers so code looks the same everywhere it appears:
 *
 * - the EDITOR, via `codeHighlight.ts` (a CodeMirror `HighlightStyle` built
 *   from these specs), and
 * - the CLIPBOARD, via `highlightFence.ts` (inline-styled spans — pasted HTML
 *   carries no stylesheet, so classes would be dead weight there).
 *
 * Each entry carries both a CSS custom property and a literal colour, because
 * the two renderers cannot use the same one:
 *
 * - the editor emits a stylesheet, so it can read `var(--md-code-…)` and let a
 *   host restyle code for a dark theme;
 * - the clipboard cannot. Pasted HTML arrives with no stylesheet, so a `var()`
 *   would resolve to nothing and paste colourless code into Google Docs or
 *   Word. It keeps the literal — which is also right on the merits, since the
 *   document being pasted into is white whatever theme the editor was in.
 *
 * So `color` is the light value AND the fallback; a host that sets no variables
 * gets exactly the palette it got before.
 */

import { tags, type Tag } from "@lezer/highlight";

export interface CodeStyleSpec {
  tag: Tag | readonly Tag[];
  /** Literal colour: the light value, the `var()` fallback, and what the
   *  clipboard uses verbatim. */
  color: string;
  /** Custom property a host can set to restyle this role. */
  cssVar: string;
  fontStyle?: string;
}

export const CODE_PALETTE: readonly CodeStyleSpec[] = [
  {
    tag: [tags.keyword, tags.modifier, tags.operatorKeyword],
    color: "#a626a4",
    cssVar: "--md-code-keyword",
  },
  {
    tag: [tags.string, tags.special(tags.string)],
    color: "#50a14f",
    cssVar: "--md-code-string",
  },
  {
    tag: tags.comment,
    color: "#a0a1a7",
    cssVar: "--md-code-comment",
    fontStyle: "italic",
  },
  {
    tag: [tags.number, tags.bool, tags.null, tags.atom],
    color: "#986801",
    cssVar: "--md-code-literal",
  },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: "#4078f2",
    cssVar: "--md-code-function",
  },
  {
    tag: [tags.typeName, tags.className, tags.namespace],
    color: "#c18401",
    cssVar: "--md-code-type",
  },
  {
    tag: tags.definition(tags.variableName),
    color: "#e45649",
    cssVar: "--md-code-variable",
  },
  { tag: tags.propertyName, color: "#4078f2", cssVar: "--md-code-property" },
  { tag: [tags.tagName, tags.self], color: "#e45649", cssVar: "--md-code-tag" },
  { tag: tags.attributeName, color: "#986801", cssVar: "--md-code-attribute" },
  { tag: [tags.regexp, tags.escape], color: "#0184bc", cssVar: "--md-code-regexp" },
  { tag: tags.invalid, color: "#ca1243", cssVar: "--md-code-invalid" },
];

/** What the editor paints with: themeable, falling back to the light value. */
export function themedColor(spec: CodeStyleSpec): string {
  return `var(${spec.cssVar}, ${spec.color})`;
}
