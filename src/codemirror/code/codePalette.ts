/**
 * The one code-syntax palette (One Light values — ADR 0002), consumed by both
 * renderers so code looks the same everywhere it appears:
 *
 * - the EDITOR, via `codeHighlight.ts` (a CodeMirror `HighlightStyle` built
 *   from these specs), and
 * - the CLIPBOARD, via `highlightFence.ts` (inline-styled spans — pasted HTML
 *   carries no stylesheet, so classes would be dead weight there).
 */

import { tags, type Tag } from "@lezer/highlight";

export interface CodeStyleSpec {
  tag: Tag | readonly Tag[];
  color: string;
  fontStyle?: string;
}

export const CODE_PALETTE: readonly CodeStyleSpec[] = [
  { tag: [tags.keyword, tags.modifier, tags.operatorKeyword], color: "#a626a4" },
  { tag: [tags.string, tags.special(tags.string)], color: "#50a14f" },
  { tag: tags.comment, color: "#a0a1a7", fontStyle: "italic" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: "#986801" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "#4078f2" },
  { tag: [tags.typeName, tags.className, tags.namespace], color: "#c18401" },
  { tag: tags.definition(tags.variableName), color: "#e45649" },
  { tag: tags.propertyName, color: "#4078f2" },
  { tag: [tags.tagName, tags.self], color: "#e45649" },
  { tag: tags.attributeName, color: "#986801" },
  { tag: [tags.regexp, tags.escape], color: "#0184bc" },
  { tag: tags.invalid, color: "#ca1243" },
];
