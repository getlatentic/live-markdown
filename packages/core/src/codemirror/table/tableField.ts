import { type EditorState, StateField, type Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

import { nodesNamed, readAfter, readAll } from "../core/treeRanges";
import { parseTableNode, type TableModel } from "./tableModel";
import { TableWidgetV2 } from "../tablev2/tableWidgetV2";

const drawn = ({ data, from, to }: TableModel): Range<Decoration> => Decoration.replace({ widget: new TableWidgetV2(data), block: true }).range(from, to);

/** One Lezer Table node can hold several tables (back-to-back, no blank line
 *  between); each is its own widget over its own source range. */
const tables = nodesNamed<Decoration>("Table", (state, node) => parseTableNode(state, node).map(drawn));

/** Every table of the document, read from nothing. */
export const allTables = (state: EditorState): DecorationSet => readAll(state, tables);

export const tableField = StateField.define<DecorationSet>({
  create: allTables,
  update: (value, tr) => readAfter(value, tr, tables),
  provide: (f) => EditorView.decorations.from(f),
});
