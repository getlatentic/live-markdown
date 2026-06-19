import { wikilinkPlugin } from "../decorations/wikilinkPlugin";

import { type MarkdownExtension } from "./types";

export const wikilinkExtension: MarkdownExtension = {
  name: "@compose/wikilink",
  version: "0.1.0",
  description: "Renders `[[target]]` / `[[target|alias]]` as clickable links.",
  extensions: [wikilinkPlugin],
};
