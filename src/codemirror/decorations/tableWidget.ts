import { EditorView, WidgetType } from "@codemirror/view";

import { type TableData } from "./tableModel";
import { renderCellInto } from "./tableCell";

export { type TableData } from "./tableModel";

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
      renderCellInto(th, cell);
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
        renderCellInto(td, cell);
        const align = this.data.alignments[i];
        if (align) td.style.textAlign = align;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    table.addEventListener("dblclick", () => {
      view.dispatch({
        selection: { anchor: this.sourceFrom, head: this.sourceTo },
        userEvent: "select.pointer",
      });
      view.focus();
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
