import { EditorView } from "@codemirror/view";

import { tableField } from "../decorations/tableField";

import { type MarkdownExtension } from "./types";

export const tableExtension: MarkdownExtension = {
  name: "@compose/table",
  version: "0.1.0",
  description: "Renders GFM tables as an editable grid widget (block-level StateField).",
  extensions: [
    tableField,
    // Treat each table as one atomic block: the caret, clicks, and selection
    // skip over it instead of landing on its hidden `| … |` source. Without
    // this, arrows/clicks resolve to hidden offsets and Backspace edits a
    // hidden pipe — corrupting the grid (and eating the blank-line separator).
    EditorView.atomicRanges.of((view) => view.state.field(tableField)),
  ],
};
