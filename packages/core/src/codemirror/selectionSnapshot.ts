import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import type { SourceRange } from "../types";
import { byteRangeOf } from "./byteOffset";
import { onEditorUpdate } from "./updateBus";

/** A non-empty editor selection, in document byte offsets. */
export interface EditorSelectionSnapshot {
  range: SourceRange;
  text: string;
}

export function selectionSnapshot(state: EditorState): EditorSelectionSnapshot | null {
  const main = state.selection.main;
  if (main.empty) return null;
  return { range: byteRangeOf(state, main.from, main.to), text: state.sliceDoc(main.from, main.to) };
}

/**
 * Call `report` with the selection now and after every change to it, for a
 * host's selection actions (a comment bubble). Returns the unsubscribe.
 */
export function watchSelection(
  view: EditorView,
  report: (selection: EditorSelectionSnapshot | null) => void,
): () => void {
  report(selectionSnapshot(view.state));
  return onEditorUpdate(view, (update) => {
    if (update.docChanged || update.selectionSet) report(selectionSnapshot(update.state));
  });
}
