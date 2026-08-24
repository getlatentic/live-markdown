import { wikilinkPlugin } from "../wikilink";
import { inlineScanRulesFacet } from "../core/inlineScan";
import { wikilinkScanRule } from "../wikilink/wikilinkScanRule";

import { type MarkdownExtension } from "./types";

export const wikilinkExtension: MarkdownExtension = {
  name: "@compose/wikilink",
  version: "0.1.0",
  description: "Renders `[[target]]` / `[[target|alias]]` as clickable links.",
  extensions: [wikilinkPlugin, inlineScanRulesFacet.of(wikilinkScanRule)],
};
