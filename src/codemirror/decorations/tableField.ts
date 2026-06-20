import { syntaxTree } from "@codemirror/language";
import { type EditorState, StateField, type Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

import { parseTableNode } from "./tableModel";
import { TableWidget } from "./tableWidget";

function buildTableDecorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "Table") return;
      const data = parseTableNode(state, node.node);
      if (!data) return;
      ranges.push(
        Decoration.replace({
          widget: new TableWidget(data, node.from, node.to),
          block: true,
        }).range(node.from, node.to),
      );
    },
  });
  return Decoration.set(ranges, true);
}

export const tableField = StateField.define<DecorationSet>({
  create: buildTableDecorations,
  update(value, tr) {
    if (!tr.docChanged) return value;
    return buildTableDecorations(tr.state);
  },
  provide: (f) => EditorView.decorations.from(f),
});
