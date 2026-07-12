import { mermaidField } from "../decorations/mermaidPlugin";

import { type MarkdownExtension } from "./types";

export const mermaidExtension: MarkdownExtension = {
  name: "@compose/mermaid",
  version: "0.1.0",
  description:
    "Renders closed ```mermaid fences as diagrams; click a diagram to edit its source.",
  extensions: [mermaidField],
};
