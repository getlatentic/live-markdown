/** `[^1]` for the string renderers — the marker without its brackets, as the
 *  editor draws it. */

import { escapeText } from "../core/htmlEscape";
import { type InlineScanRule } from "../core/inlineScan";
import { FOOTNOTE_REF_RE } from "./footnotePlugin";

export const footnoteScanRule: InlineScanRule = {
  name: "footnote",
  pattern: FOOTNOTE_REF_RE,
  render: (match) => `<span class="cm-footnote-ref">${escapeText(match[1] ?? "")}</span>`,
};
