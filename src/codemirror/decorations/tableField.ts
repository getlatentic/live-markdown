import { syntaxTree } from "@codemirror/language";
import { type EditorState, StateField, type Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

import { parseTableNode } from "./tableModel";
import { TableWidgetV2 } from "../tablev2/tableWidgetV2";

function buildTableDecorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "Table") return;
      // One Lezer Table node can hold several tables (back-to-back, no blank
      // line between); each becomes its own widget over its own source range.
      for (const model of parseTableNode(state, node.node)) {
        ranges.push(
          Decoration.replace({
            widget: new TableWidgetV2(model.data, model.from, model.to),
            block: true,
          }).range(model.from, model.to),
        );
      }
    },
  });
  return Decoration.set(ranges, true);
}

export const tableField = StateField.define<DecorationSet>({
  create: buildTableDecorations,
  update(value, tr) {
    // Rebuild on edits AND when the parser advances. CodeMirror parses lazily,
    // so on a long document the tables below the initially-parsed region only
    // enter the syntax tree as the user scrolls; without rebuilding on parse
    // progress they never get decorated and stay as raw `| … |` markdown.
    if (tr.docChanged || syntaxTree(tr.state) !== syntaxTree(tr.startState)) {
      return buildTableDecorations(tr.state);
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});
