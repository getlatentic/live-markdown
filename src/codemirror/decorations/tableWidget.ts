import { EditorView, WidgetType } from "@codemirror/view";

import { type TableData, type TableCellData } from "./tableModel";
import { renderCellInto } from "./tableCell";
import { mountCellSubview } from "./tableCellSubview";
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

    // Double-click a cell to edit its markdown inline: a small editor mounts in
    // the cell, seeded from the source range `fillCell` stamped on it.
    table.addEventListener("dblclick", (event) => {
      const cell = (event.target as HTMLElement).closest("th, td");
      if (!(cell instanceof HTMLElement) || cell.dataset.cellFrom === undefined) return;
      mountCellSubview(cell, view, Number(cell.dataset.cellFrom), Number(cell.dataset.cellTo));
    });

    // Cell links render for display; letting the browser follow one would
    // navigate the whole webview away, so swallow the click and route a
    // Cmd/Ctrl-click to the host's external opener (mirrors clickModel).
    table.addEventListener("click", (event) => {
      const anchor = (event.target as HTMLElement).closest("a");
      if (!anchor) return;
      event.preventDefault();
      const href = anchor.getAttribute("href");
      if (href && (event.metaKey || event.ctrlKey)) {
        view.state.facet(openExternalUrlFacet)(href);
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
