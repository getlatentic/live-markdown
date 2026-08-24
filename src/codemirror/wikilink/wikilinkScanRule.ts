/** `[[target]]` / `[[target|alias]]` for the string renderers — the label the
 *  editor shows, styled by the same `.cm-wikilink` rule as body text. */

import { parseWikilinkBody } from "../../links/wikilink";
import { escapeText } from "../core/htmlEscape";
import { type InlineScanRule } from "../core/inlineScan";
import { WIKILINK_RE } from "./wikilinkPlugin";

export const wikilinkScanRule: InlineScanRule = {
  name: "wikilink",
  pattern: WIKILINK_RE,
  render: (match) =>
    `<span class="cm-wikilink">${escapeText(parseWikilinkBody(match[1] ?? "").label)}</span>`,
};
