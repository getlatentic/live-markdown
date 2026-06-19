import { EditorView, WidgetType } from "@codemirror/view";

export interface TableData {
  header: string[];
  rows: string[][];
  alignments: Array<"left" | "right" | "center" | null>;
}

function alignmentFor(spec: string): "left" | "right" | "center" | null {
  const t = spec.trim();
  if (!t) return null;
  const left = t.startsWith(":");
  const right = t.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

function splitCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function parseTableSource(source: string): TableData | null {
  const lines = source.split("\n").map((l) => l.trim()).filter((l) => l !== "");
  if (lines.length < 2) return null;
  const header = splitCells(lines[0]);
  const separator = splitCells(lines[1]);
  if (separator.length === 0 || !separator.every((s) => /^:?-+:?$/.test(s.trim()))) return null;
  const alignments = separator.map(alignmentFor);
  const rows = lines.slice(2).map(splitCells);
  return { header, rows, alignments };
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
      th.textContent = cell;
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
        td.textContent = cell;
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
