/**
 * Visible "armed for deletion" state for the two-step table delete.
 *
 * The first Backspace/Delete next to a table parks the caret at the table's
 * edge instead of editing its hidden source (see deleteNormalizer). A bare
 * caret there is easy to miss, so this plugin outlines the table the caret is
 * parked against — the cue that the next press removes it (Zettlr's "caret
 * behind the table" affordance). It is driven entirely off the live selection,
 * so the outline clears the instant the caret moves away or the table is gone.
 */

import { type EditorState } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

import { tableField } from "./tableField";

/** The `from` of the table whose edge an empty caret rests on, or -1 for none. */
export function armedTableFrom(state: EditorState): number {
  const sel = state.selection.main;
  if (!sel.empty) return -1;
  let from = -1;
  state.field(tableField, false)?.between(sel.head, sel.head, (rangeFrom, rangeTo) => {
    if (rangeFrom === sel.head || rangeTo === sel.head) from = rangeFrom;
  });
  return from;
}

class TableArmedHighlighter {
  constructor(view: EditorView) {
    this.sync(view);
  }

  update(update: ViewUpdate): void {
    if (update.selectionSet || update.docChanged || update.viewportChanged) {
      this.sync(update.view);
    }
  }

  private sync(view: EditorView): void {
    const armed = armedTableFrom(view.state);
    for (const wrap of view.dom.querySelectorAll<HTMLElement>(".cm-table-wrap")) {
      const isArmed = armed >= 0 && Number(wrap.dataset.tableFrom) === armed;
      wrap.classList.toggle("cm-table-armed", isArmed);
    }
  }
}

export const tableArmedHighlight = ViewPlugin.fromClass(TableArmedHighlighter);
