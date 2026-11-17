/**
 * Constructs Lezer never parses.
 *
 * Wikilinks, `==highlight==`, footnote references and `$math$` are not
 * CommonMark, so no node exists for any of them and the editor finds each by
 * scanning text (`codeContext.ts` documents the shared code guard). A renderer
 * that walks the tree is therefore blind to all four — which is how a table cell
 * came to show `$440 = 2 \times \frac{22}{7} \times r$` as literal source while
 * the same expression rendered as mathematics in the paragraph above it.
 *
 * A feature contributes its pattern and its markup through this facet; the
 * string renderers consult the facet and stay ignorant of what the constructs
 * are. The decoration plugins keep their own viewport-scanning path — the two
 * paths share the pattern, not the machinery, because one produces decorations
 * over a live document and the other an HTML string.
 */

import { Facet } from "@codemirror/state";

export interface InlineScanRule {
  readonly name: string;
  /** Global-flagged; the scanner drives `exec` and resets `lastIndex`. */
  readonly pattern: RegExp;
  /** Markup for one match. Escaping document text is the rule's job. */
  render(match: RegExpExecArray): string;
  /**
   * Upgrade rendered markup to real DOM, after sanitisation. Only for a
   * construct whose rendering is DOM rather than markup (KaTeX): the generated
   * nodes bypass the sanitiser, so a hydrate reads inert text from the element
   * it replaces and never trusts the document.
   */
  hydrate?(root: HTMLElement): void;
}

export const inlineScanRulesFacet = Facet.define<InlineScanRule, readonly InlineScanRule[]>({
  combine: (values) => values,
});

export interface InlineScanMatch {
  readonly from: number;
  readonly to: number;
  readonly html: string;
}

/**
 * Every rule's matches in `text`, in document order, offset by `at`.
 *
 * Earliest wins, then longest — two constructs cannot both own one span, and
 * the alternative (rule declaration order) would make the result depend on
 * extension load order.
 */
export function scanInline(
  rules: readonly InlineScanRule[],
  text: string,
  at = 0,
): InlineScanMatch[] {
  const found: InlineScanMatch[] = [];
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rule.pattern.exec(text)) !== null) {
      found.push({
        from: at + match.index,
        to: at + match.index + match[0].length,
        html: rule.render(match),
      });
    }
  }
  found.sort((a, b) => a.from - b.from || b.to - a.to);
  const kept: InlineScanMatch[] = [];
  for (const span of found) {
    const last = kept[kept.length - 1];
    if (!last || span.from >= last.to) kept.push(span);
  }
  return kept;
}
