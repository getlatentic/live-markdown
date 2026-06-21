import { type ChangeSpec, type EditorState } from "@codemirror/state";
import { type EditorView } from "@codemirror/view";

import { addColumnAfter, addRowBelow } from "./tableEditCommands";

type InsertCommand = (state: EditorState, pos: number) => ChangeSpec | null;

/** Inserter circle diameter; keep in sync with `.cm-table-inserter` in editorTheme. */
const PLUS = 20;

interface HoverControlsArgs {
  wrap: HTMLElement;
  table: HTMLTableElement;
  view: EditorView;
}

/**
 * Zettlr-style quick inserters. Hovering a cell reveals a "+" out in the
 * wrapper's padding gutter — beyond that row's bottom-left and the column's
 * top-right — and clicking inserts a row below or a column after, from the
 * hovered cell's source position. Living in the gutter (not on the grid line)
 * keeps each "+" clear of the edge, so it never clips at a corner or hides under
 * the header. The right-click menu still carries the full set (insert either
 * side, delete).
 */
export function attachHoverControls({ wrap, table, view }: HoverControlsArgs): void {
  const rowPlus = makeInserter("row", "Insert row below");
  const colPlus = makeInserter("column", "Insert column right");
  wrap.append(rowPlus, colPlus);
  hide();

  function hide(): void {
    rowPlus.style.display = "none";
    colPlus.style.display = "none";
  }

  wrap.addEventListener("mousemove", (event) => {
    const target = event.target as HTMLElement;
    // On an inserter → leave it exactly where it is so it stays clickable.
    if (target.closest(".cm-table-inserter")) return;

    const cell = target.closest("th, td");
    if (cell instanceof HTMLElement && cell.querySelector(".cm-editor")) {
      hide(); // a cell editor is open here — stay out of its way
      return;
    }
    if (!(cell instanceof HTMLElement) || cell.dataset.cellFrom === undefined) {
      // A non-cell spot inside the wrapper (the gutter, borders): leave the
      // inserters put rather than hiding, so the pointer can reach them.
      return;
    }

    // Stamp the source position on each inserter so a click acts on the last
    // hovered cell even if the pointer wandered off it to reach the button.
    rowPlus.dataset.pos = cell.dataset.cellFrom;
    colPlus.dataset.pos = cell.dataset.cellFrom;

    const cellRect = cell.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const leftGutter = tableRect.left - wrapRect.left;
    const topGutter = tableRect.top - wrapRect.top;

    // Row inserter: centred in the left gutter, level with the row's bottom edge.
    rowPlus.style.display = "flex";
    rowPlus.style.left = `${(leftGutter - PLUS) / 2}px`;
    rowPlus.style.top = `${cellRect.bottom - wrapRect.top - PLUS / 2}px`;

    // Column inserter: centred in the top gutter, over the column's right edge.
    colPlus.style.display = "flex";
    colPlus.style.left = `${cellRect.right - wrapRect.left - PLUS / 2}px`;
    colPlus.style.top = `${(topGutter - PLUS) / 2}px`;
  });

  wrap.addEventListener("mouseleave", hide);

  rowPlus.addEventListener("click", () => runInsert(rowPlus, addRowBelow));
  colPlus.addEventListener("click", () => runInsert(colPlus, addColumnAfter));

  function runInsert(inserter: HTMLElement, command: InsertCommand): void {
    const pos = inserter.dataset.pos;
    if (pos === undefined) return;
    const change = command(view.state, Number(pos));
    if (change) {
      view.dispatch({ changes: change, userEvent: "input.table.structure" });
      view.focus();
    }
  }
}

function makeInserter(kind: "row" | "column", label: string): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `cm-table-inserter cm-table-inserter--${kind}`;
  el.setAttribute("aria-label", label);
  el.textContent = "+";
  return el;
}
