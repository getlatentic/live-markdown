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

/** Which edge of a table an empty caret is parked against. `"end"` is the
 *  trailing edge (a Backspace from the line below parks here); `"start"` is the
 *  leading edge (a Delete from the line above). The edge decides where the green
 *  cursor line is drawn — under the table or over it. */
export interface ArmedTable {
  from: number;
  edge: "start" | "end";
}

/** The table (and which edge) an empty caret rests against, or null for none. */
export function armedTable(state: EditorState): ArmedTable | null {
  const sel = state.selection.main;
  if (!sel.empty) return null;
  let armed: ArmedTable | null = null;
  state.field(tableField, false)?.between(sel.head, sel.head, (rangeFrom, rangeTo) => {
    if (rangeTo === sel.head) armed = { from: rangeFrom, edge: "end" };
    else if (rangeFrom === sel.head) armed = { from: rangeFrom, edge: "start" };
  });
  return armed;
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
    const armed = armedTable(view.state);
    // Root class lets the theme hide the parked caret — it would otherwise blink
    // on the blank line just past the table (table.to is a block boundary CM
    // paints below the widget), competing with the outline + green edge line.
    view.dom.classList.toggle("cm-table-arming", armed !== null);
    for (const wrap of view.dom.querySelectorAll<HTMLElement>(".cm-table-wrap")) {
      const isArmed = armed !== null && Number(wrap.dataset.tableFrom) === armed.from;
      wrap.classList.toggle("cm-table-armed", isArmed);
      if (armed && isArmed) wrap.dataset.armedEdge = armed.edge;
      else delete wrap.dataset.armedEdge;
    }
  }
}

export const tableArmedHighlight = ViewPlugin.fromClass(TableArmedHighlighter);
