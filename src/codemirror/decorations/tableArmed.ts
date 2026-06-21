/**
 * Visible "armed for deletion" state for the two-step table delete.
 *
 * The first Backspace/Delete next to a table parks the caret at the table's
 * edge instead of editing its hidden source (see deleteNormalizer), and records
 * that intent here via `setArmedTable`. While armed, this plugin outlines the
 * table and draws a green "cursor behind the table" line at the parked edge —
 * the cue that the next press removes it (Zettlr's affordance) — and the theme
 * hides the real caret.
 *
 * Arming is EXPLICIT, not inferred from the caret resting at an edge: ordinary
 * navigation lands the caret on a table edge too, and that must not arm
 * anything or hide the cursor. Any later move or edit disarms.
 */

import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

/** Which edge of a table the caret is parked against. `"end"` is the trailing
 *  edge (a Backspace from the line below); `"start"` is the leading edge (a
 *  Delete from the line above). The edge decides where the green line is drawn
 *  — under the table or over it. */
export interface ArmedTable {
  from: number;
  edge: "start" | "end";
}

/** Arm (with an `ArmedTable`) or disarm (with null) the two-step table delete.
 *  Dispatched by the delete normalizer when its first press parks the caret. */
export const setArmedTable = StateEffect.define<ArmedTable | null>();

/** The armed table, or null. Set only by `setArmedTable`; cleared by any cursor
 *  move or document edit, so navigating onto a table edge never arms it. */
export const armedTableField = StateField.define<ArmedTable | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setArmedTable)) return effect.value;
    if (tr.selection || tr.docChanged) return null;
    return value;
  },
});

export function armedTable(state: EditorState): ArmedTable | null {
  return state.field(armedTableField, false) ?? null;
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
