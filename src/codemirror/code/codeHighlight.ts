/**
 * Syntax colors for fenced-code content (ADR 0002). The markdown grammar's
 * own constructs (headings, emphasis, links…) are styled by the decoration
 * registry + editorTheme, NOT here — so this style deliberately covers only
 * tags that code languages emit and markdown does not. The palette itself
 * lives in [codePalette](./codePalette.ts), shared with the clipboard's
 * inline-styled renderer.
 */

import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";

import { CODE_PALETTE } from "./codePalette";

const style = HighlightStyle.define(
  CODE_PALETTE.map((spec) => ({ tag: spec.tag, color: spec.color, fontStyle: spec.fontStyle })),
);

export const codeHighlight = syntaxHighlighting(style);
