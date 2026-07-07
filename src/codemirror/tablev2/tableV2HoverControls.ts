/**
 * Zettlr-style quick inserters for the V2 table: hovering a cell reveals a
 * "+" in the wrap's gutter — below-left for a row, top-right for a column —
 * inserting relative to the hovered cell. The right-click menu carries the
 * full command set; these are the two high-frequency shortcuts.
 *
 * Ported from the V1 controls with both approved fixes baked in:
 *   - repositioning is gated on the hovered CELL changing (per-mousemove
 *     rewrites made the buttons jitter — "flashing"),
 *   - the glyph is a centred SVG on a subtle neutral chip; the primary accent
 *     is the hover state, not the resting state (editorTheme).
 *
 * One delegated listener per editor; buttons attach lazily per wrap and are
 * re-attached automatically after a widget recreate (the next mousemove).
 */

import { ViewPlugin } from "@codemirror/view";
import { type ChangeSpec, type EditorState } from "@codemirror/state";

import { addColumnAfter, addRowBelow } from "../decorations/tableEditCommands";

type InsertCommand = (state: EditorState, pos: number) => ChangeSpec | null;

/** Inserter circle diameter; keep in sync with `.cm-table-inserter`. */
const PLUS = 20;

const PLUS_SVG =
  '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">' +
  '<path d="M8 2.75v10.5M2.75 8h10.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

function makeInserter(kind: "row" | "column", label: string): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `cm-table-inserter cm-table-inserter--${kind}`;
  el.setAttribute("aria-label", label);
  el.innerHTML = PLUS_SVG;
  return el;
}

export function tableV2HoverControls() {
  return ViewPlugin.define((view) => {
    let lastCell: Element | null = null;

    const runInsert = (event: Event): void => {
      const button = event.currentTarget as HTMLElement;
      const pos = Number(button.dataset.pos);
      if (Number.isNaN(pos)) return;
      const command: InsertCommand = button.classList.contains("cm-table-inserter--row")
        ? addRowBelow
        : addColumnAfter;
      const change = command(view.state, pos);
      if (change) view.dispatch({ changes: change, userEvent: "input.table.structure" });
    };

    const ensure = (wrap: HTMLElement): { row: HTMLElement; col: HTMLElement } => {
      let row = wrap.querySelector<HTMLElement>(":scope > .cm-table-inserter--row");
      let col = wrap.querySelector<HTMLElement>(":scope > .cm-table-inserter--column");
      if (!row) {
        row = makeInserter("row", "Insert row below");
        row.addEventListener("click", runInsert);
        wrap.appendChild(row);
      }
      if (!col) {
        col = makeInserter("column", "Insert column right");
        col.addEventListener("click", runInsert);
        wrap.appendChild(col);
      }
      return { row, col };
    };

    const hideAll = (): void => {
      lastCell = null;
      view.dom
        .querySelectorAll<HTMLElement>(".cm-table-inserter")
        .forEach((el) => (el.style.display = "none"));
    };

    const onMouseMove = (event: MouseEvent): void => {
      const target = event.target as HTMLElement;
      // On an inserter: leave it exactly where it is so it stays clickable.
      if (target.closest?.(".cm-table-inserter")) return;
      const cell = target.closest?.("[data-cell-from]");
      const wrap = target.closest?.("[data-tablev2-from]");
      if (!(cell instanceof HTMLElement) || !(wrap instanceof HTMLElement)) {
        hideAll();
        return;
      }
      if (cell.getAttribute("contenteditable")) {
        // The cell is being edited — stay out of its way.
        hideAll();
        return;
      }
      // Reposition only when the hovered cell changes: per-move rewrites
      // jitter ("flashing") while the pointer travels within one cell.
      if (cell === lastCell) return;
      lastCell = cell;

      const { row, col } = ensure(wrap);
      row.dataset.pos = cell.dataset.cellFrom;
      col.dataset.pos = cell.dataset.cellFrom;

      const table = wrap.querySelector("table");
      if (!table) return;
      const cellRect = cell.getBoundingClientRect();
      const tableRect = table.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      const leftGutter = tableRect.left - wrapRect.left;
      const topGutter = tableRect.top - wrapRect.top;

      row.style.display = "flex";
      row.style.left = `${(leftGutter - PLUS) / 2}px`;
      row.style.top = `${cellRect.bottom - wrapRect.top - PLUS / 2}px`;

      col.style.display = "flex";
      col.style.left = `${cellRect.right - wrapRect.left - PLUS / 2}px`;
      col.style.top = `${(topGutter - PLUS) / 2}px`;
    };

    view.dom.addEventListener("mousemove", onMouseMove);
    view.dom.addEventListener("mouseleave", hideAll);
    return {
      destroy() {
        view.dom.removeEventListener("mousemove", onMouseMove);
        view.dom.removeEventListener("mouseleave", hideAll);
      },
    };
  });
}
