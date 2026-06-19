import { highlightPlugin } from "../decorations/highlightPlugin";

import { type MarkdownExtension } from "./types";

export const highlightExtension: MarkdownExtension = {
  name: "@compose/highlight",
  version: "0.1.0",
  description: "Renders `==text==` with a yellow highlight background.",
  extensions: [highlightPlugin],
};
