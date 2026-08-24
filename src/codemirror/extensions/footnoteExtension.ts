import { footnotePlugin } from "../footnote";
import { inlineScanRulesFacet } from "../core/inlineScan";
import { footnoteScanRule } from "../footnote/footnoteScanRule";

import { type MarkdownExtension } from "./types";

export const footnoteExtension: MarkdownExtension = {
  name: "@compose/footnote",
  version: "0.1.0",
  description: "Renders `[^id]` references and `[^id]:` definitions with tooltip jump.",
  extensions: [footnotePlugin, inlineScanRulesFacet.of(footnoteScanRule)],
};
