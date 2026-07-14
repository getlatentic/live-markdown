/**
 * Renders a table cell's inline HTML into safe DOM.
 *
 * The string is pre-rendered by {@link renderInlineCell} (markdown markup →
 * `<span>`s carrying the editor's `.cm-*` mark classes) and may also carry
 * literal inline HTML from the source — most commonly `<br>` to stack several
 * lines in one cell — so it can't go in as `textContent`. It's sanitized through
 * DOMPurify with an inline-only allow-list: emphasis, code, links, and `<br>`
 * pass through; block, script, and event-handler markup is stripped. `class` is
 * allowed (CSS classes are inert — no XSS surface) so the mark styling survives;
 * DOMPurify also neutralises unsafe `href` schemes (e.g. `javascript:`).
 */

import DOMPurify from "dompurify";

const CELL_SANITIZE_CONFIG = {
  ALLOWED_TAGS: ["br", "b", "strong", "i", "em", "code", "sub", "sup", "del", "s", "u", "span", "a"],
  ALLOWED_ATTR: ["href", "class"],
  RETURN_TRUSTED_TYPE: false,
};

export function renderCellInto(el: HTMLElement, source: string): void {
  el.innerHTML = DOMPurify.sanitize(source, CELL_SANITIZE_CONFIG) as unknown as string;
}
