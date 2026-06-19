import { tableField } from "../decorations/tableField";

import { type MarkdownExtension } from "./types";

export const tableExtension: MarkdownExtension = {
  name: "@compose/table",
  version: "0.1.0",
  description: "Renders GFM tables as an editable grid widget (block-level StateField).",
  extensions: [tableField],
};
