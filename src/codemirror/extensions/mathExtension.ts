import { mathPlugin } from "../math";

import { type MarkdownExtension } from "./types";

export const mathExtension: MarkdownExtension = {
  name: "@compose/math",
  version: "0.1.0",
  description: "Renders `$x$` inline and `$$x$$` block math via KaTeX.",
  extensions: [mathPlugin],
};
