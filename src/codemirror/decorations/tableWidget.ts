import { EditorView, WidgetType } from "@codemirror/view";

import { type TableData, type TableCellData } from "./tableModel";
import { renderCellInto } from "./tableCell";
import { mountCellSubview } from "./tableCellSubview";
import { showTableMenu } from "./tableContextMenu";
import { openExternalUrlFacet } from "./hostFacets";

export { type TableData } from "./tableModel";

/** Render a cell's HTML and stamp its document range on the element, so the cell
 *  editor (and `coordsAt`) can map a `<td>` back to its source span. */
function fillCell(el: HTMLElement, cell: TableCellData): void {
  renderCellInto(el, cell.html);
  el.dataset.cellFrom = String(cell.from);
  el.dataset.cellTo = String(cell.to);
}

export class TableWidget extends WidgetType {
  constructor(
    readonly data: TableData,
    readonly sourceFrom: number,
    readonly sourceTo: number,
  ) {
    super();
  }

  override eq(other: TableWidget): boolean {
    return (
      other.sourceFrom === this.sourceFrom &&
      other.sourceTo === this.sourceTo &&
      JSON.stringify(other.data) === JSON.stringify(this.data)
    );
  }

  override toDOM(view: EditorView): HTMLElement {
    const table = document.createElement("table");
    table.className = "cm-table-widget";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    this.data.header.forEach((cell, i) => {
      const th = document.createElement("th");
      fillCell(th, cell);
      const align = this.data.alignments[i];
      if (align) th.style.textAlign = align;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    this.data.rows.forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((cell, i) => {
        const td = document.createElement("td");
        fillCell(td, cell);
        const align = this.data.alignments[i];
        if (align) td.style.textAlign = align;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    // Right-click a cell for the structure menu (add/delete rows + columns).
    table.addEventListener("contextmenu", (event) => {
      const cell = (event.target as HTMLElement).closest("th, td");
      if (!(cell instanceof HTMLElement) || cell.dataset.cellFrom === undefined) return;
      event.preventDefault();
      showTableMenu({ x: event.clientX, y: event.clientY, view, pos: Number(cell.dataset.cellFrom) });
    });

    // Single-click a cell to edit it inline (a small editor mounts, seeded from
    // the source range `fillCell` stamped on it). A click on a rendered link
    // instead routes a Cmd/Ctrl-click to the host opener — letting the browser
    // follow it would navigate the whole webview away.
    table.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const anchor = target.closest("a");
      if (anchor) {
        event.preventDefault();
        const href = anchor.getAttribute("href");
        if (href && (event.metaKey || event.ctrlKey)) {
          view.state.facet(openExternalUrlFacet)(href);
        }
        return;
      }
      const cell = target.closest("th, td");
      if (
        cell instanceof HTMLElement &&
        cell.dataset.cellFrom !== undefined &&
        !cell.querySelector(".cm-editor")
      ) {
        mountCellSubview(cell, view, Number(cell.dataset.cellFrom), Number(cell.dataset.cellTo));
      }
    });

    return table;
  }

  override ignoreEvent(): boolean {
    return false;
  }

  override get estimatedHeight(): number {
    return 30 + this.data.rows.length * 28;
  }
}
