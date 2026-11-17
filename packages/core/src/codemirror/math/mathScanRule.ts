/**
 * `$…$` for the string renderers.
 *
 * The only rule that hydrates: KaTeX builds DOM, and its markup carries inline
 * styles a cell's sanitiser allow-list deliberately drops. So the render pass
 * emits the TeX as inert text, the sanitiser sees only that, and KaTeX — trusted
 * code, reading the element's own `textContent` — replaces it afterwards. The
 * allow-list stays as tight as it is for prose.
 */

import { escapeText } from "../core/htmlEscape";
import { type InlineScanRule } from "../core/inlineScan";
import { INLINE_MATH_RE } from "./mathPlugin";
import { renderMathInto } from "./mathWidget";

export const mathScanRule: InlineScanRule = {
  name: "math",
  pattern: INLINE_MATH_RE,
  render: (match) => `<span class="cm-math-inline">${escapeText(match[1] ?? "")}</span>`,
  hydrate: (root) => {
    for (const el of root.querySelectorAll(".cm-math-inline")) {
      renderMathInto(el as HTMLElement, el.textContent ?? "", false);
    }
  },
};
