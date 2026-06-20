/**
 * Renders a single table cell's source text into safe DOM.
 *
 * Cells routinely carry inline HTML — most commonly `<br>` to stack several
 * lines in one cell — so the text can't go in as `textContent` (that shows
 * the raw `<br>` tag). It's sanitized through DOMPurify with an inline-only
 * allow-list: `<br>` and basic emphasis pass through; block, script, and
 * event-handler markup is stripped.
 */

import DOMPurify from "dompurify";

const CELL_SANITIZE_CONFIG = {
  ALLOWED_TAGS: ["br", "b", "strong", "i", "em", "code", "sub", "sup", "del", "s", "u", "span"],
  ALLOWED_ATTR: [] as string[],
  RETURN_TRUSTED_TYPE: false,
};

export function renderCellInto(el: HTMLElement, source: string): void {
  el.innerHTML = DOMPurify.sanitize(source, CELL_SANITIZE_CONFIG) as unknown as string;
}
