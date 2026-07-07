/**
 * Syntax colors for fenced-code content (ADR 0002). The markdown grammar's
 * own constructs (headings, emphasis, links…) are styled by the decoration
 * registry + editorTheme, NOT here — so this style deliberately covers only
 * tags that code languages emit and markdown does not. Palette follows the
 * One Light values for legibility on the editor's light surface.
 */

import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const style = HighlightStyle.define([
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
]);

export const codeHighlight = syntaxHighlighting(style);
