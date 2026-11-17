import { EditorView } from "@codemirror/view";

import { armedTableField, tableArmedHighlight, tableField } from "../table";
import { InlineCellSurface } from "../tablev2/inlineCellSurface";
import { tableV2HoverControls } from "../tablev2/tableV2HoverControls";
import { tableV2Interaction } from "../tablev2/tableV2Interaction";
import { tableV2Sync } from "../tablev2/tableV2Sync";

import { type MarkdownExtension } from "./types";

/**
 * A FACTORY, not a const: each composition gets its own editing surface (the
 * one-active-edit state), so two mounted editors can never share a cell edit.
 */
export function tableExtension(): MarkdownExtension {
  const surface = new InlineCellSurface();
  return {
    name: "@compose/table",
    version: "0.2.0",
    description:
      "Renders GFM tables as a grid widget; cells edit natively in place (ADR 0001).",
    extensions: [
      tableField,
      // Treat each table as one atomic block: the caret, clicks, and selection
      // skip over it instead of landing on its hidden `| … |` source. Without
      // this, arrows/clicks resolve to hidden offsets and Backspace edits a
      // hidden pipe — corrupting the grid (and eating the blank-line separator).
      EditorView.atomicRanges.of((view) => view.state.field(tableField)),
      // Two-step delete: the field records which table the next press deletes;
      // the plugin outlines it and draws the "armed" edge line.
      armedTableField,
      tableArmedHighlight,
      // Keep the surface's table anchor + active edit alive across doc changes.
      tableV2Sync(surface),
      // Click-to-edit at the clicked character, bridge keys (Tab/arrows/
      // Backspace/Delete/Enter), whole-cell drag selection + TSV copy, the
      // structure menu, and table entry/exit from the main document.
      tableV2Interaction(surface),
      // Hover "+" quick inserters (row below / column right).
      tableV2HoverControls(),
    ],
  };
}
