/**
 * Synchronous fence highlighting for the clipboard (#149).
 *
 * A copy event writes `text/html` synchronously, so highlighting must not
 * await anything. The trick: the grammars are the SAME `@codemirror/language-data`
 * singletons the editor's nested fence parse loads — any fence visible in the
 * editor has its grammar warm, so highlighting the copied code is a sync parse.
 * A cold grammar (copy from a doc whose fence never rendered) kicks the load
 * and returns null: THIS copy ships plain, the next one is highlighted.
 *
 * Output is inline-styled spans (the palette from
 * [codePalette](./codePalette.ts), same colors as the editor) — pasted HTML
 * carries no stylesheet, so classes would be dead weight in Docs/Word.
 */

import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { highlightCode, tagHighlighter } from "@lezer/highlight";

import { CODE_PALETTE } from "./codePalette";

export interface HighlightedSpan {
  text: string;
  /** Inline CSS for the span; absent for unstyled text (incl. line breaks). */
  style?: string;
}

const styleByClass = new Map(
  CODE_PALETTE.map((spec, index) => [
    `tok${index}`,
    `color:${spec.color}${spec.fontStyle ? `;font-style:${spec.fontStyle}` : ""}`,
  ]),
);

// tagHighlighter implements lezer's tag-containment matching (a token tagged
// `function(variableName)` matches a spec on either tag) — hand-rolling that
// gets the precedence subtly wrong.
const paletteHighlighter = tagHighlighter(
  CODE_PALETTE.map((spec, index) => ({ tag: spec.tag as never, class: `tok${index}` })),
);

function styleFor(classes: string): string | undefined {
  const styles = classes
    .split(" ")
    .map((cls) => styleByClass.get(cls))
    .filter(Boolean);
  return styles.length > 0 ? styles.join(";") : undefined;
}

/** Highlight `code` as `lang` into inline-styled spans, or null when no
 *  grammar matches or the grammar isn't loaded yet (the load is kicked so a
 *  later copy succeeds). Never throws — a parser hiccup falls back to null. */
export function highlightFenceSpans(lang: string, code: string): HighlightedSpan[] | null {
  const description = LanguageDescription.matchLanguageName(languages, lang, true);
  if (!description) return null;
  if (!description.support) {
    void description.load().catch(() => {});
    return null;
  }
  try {
    const parser = description.support.language.parser;
    const spans: HighlightedSpan[] = [];
    highlightCode(
      code,
      parser.parse(code),
      paletteHighlighter,
      (text, classes) => spans.push(classes ? { text, style: styleFor(classes) } : { text }),
      () => spans.push({ text: "\n" }),
    );
    return spans;
  } catch {
    return null;
  }
}
