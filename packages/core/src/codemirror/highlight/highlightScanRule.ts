/** `==marked==` for the string renderers. */

import { escapeText } from "../core/htmlEscape";
import { type InlineScanRule } from "../core/inlineScan";
import { HIGHLIGHT_RE } from "./highlightPlugin";

export const highlightScanRule: InlineScanRule = {
  name: "highlight",
  pattern: HIGHLIGHT_RE,
  render: (match) => `<span class="cm-highlight">${escapeText(match[1] ?? "")}</span>`,
};
