import { footnotePlugin } from "../decorations/footnotePlugin";

import { type MarkdownExtension } from "./types";

export const footnoteExtension: MarkdownExtension = {
  name: "@compose/footnote",
  version: "0.1.0",
  description: "Renders `[^id]` references and `[^id]:` definitions with tooltip jump.",
  extensions: [footnotePlugin],
};
