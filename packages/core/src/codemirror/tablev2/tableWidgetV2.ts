/**
 * V2 table widget (ADR 0001): pure render, stable lifecycle, no editors inside.
 *
 * Lifecycle contract — the make-or-break constraint:
 *   - `eq` compares what the table draws, not where its source stands: a
 *     change above a table leaves its widget and its element alone.
 *   - `updateDOM` patches cell contents IN PLACE (element identity preserved);
 *     it declines (→ full recreate) only when the grid SHAPE changed.
 *   - After either path, the tableV2 extension calls the active surface's
 *     `reanchor` so an in-progress cell edit survives.
 *
 * Editing is delegated entirely to a {@link CellEditingSurface}; this file has
 * no caret, focus, or selection logic by design.
 */

import { type EditorView, WidgetType } from "@codemirror/view";

import { inlineScanRulesFacet, type InlineScanRule } from "../core/inlineScan";
import { renderCellInto } from "../table/tableCell";
import { type TableCellData, type TableData } from "../table/tableModel";

function fillCell(
  el: HTMLElement,
  cell: TableCellData,
  row: number,
  col: number,
  rules: readonly InlineScanRule[],
): void {
  renderCellInto(el, cell.html, rules);
  el.dataset.row = String(row);
  el.dataset.col = String(col);
}

/** The class of a drawn table's outer element. */
export const TABLE_WRAP_CLASS = "cm-tablev2-wrap";

/** One rendered text line inside a cell (theme line-height + padding). */
const ROW_LINE_PX = 28;
/** Header row + top/bottom borders. */
const HEADER_PX = 30;
/** Characters a full table row fits per rendered line at the panel's usual
 *  width. Auto layout shares this across columns proportionally to content,
 *  so per-ROW totals predict wrapping far better than any per-column guess. */
const ROW_CHARS_PER_LINE = 85;

/**
 * Wrap-aware height estimate for an unmeasured table. CM6 places everything
 * below an unmeasured widget using this number; the previous one-line-per-row
 * assumption under-estimated prose-heavy tables by 3-5×, so a fast scroll ran
 * on geometry that was off by hundreds of px per table — and the correction,
 * landing mid-interaction, yanked the viewport and re-anchored selections
 * onto whatever content shifted under the pointer.
 */
export function estimateTableHeight(data: TableData): number {
  let height = HEADER_PX;
  for (const row of data.rows) {
    const rowChars = row.reduce((sum, cell) => sum + Math.max(1, cell.to - cell.from), 0);
    height += Math.max(1, Math.ceil(rowChars / ROW_CHARS_PER_LINE)) * ROW_LINE_PX;
  }
  return height;
}

/** What a table draws, apart from where its source stands: text added above
 *  a table moves its source and changes nothing it shows. */
function drawnKey({ header, rows, alignments }: TableData): string {
  const shown = (cell: TableCellData): [string, number] => [cell.html, cell.to - cell.from];
  return JSON.stringify([alignments, header.map(shown), rows.map((row) => row.map(shown))]);
}

export class TableWidgetV2 extends WidgetType {
  private readonly heightEstimate: number;
  private readonly key: string;

  /** `data` holds the positions the table's source had when it was read.
   *  They go stale as text above the table changes; the place of a drawn
   *  table is asked of the view (`tableStart`). */
  constructor(readonly data: TableData) {
    super();
    this.heightEstimate = estimateTableHeight(data);
    this.key = drawnKey(data);
  }

  override eq(other: TableWidgetV2): boolean {
    return other.key === this.key;
  }

  override toDOM(view: EditorView): HTMLElement {
    const rules = view.state.facet(inlineScanRulesFacet);
    const wrap = document.createElement("div");
    // Both generations of class/stamp: cm-table-wrap carries the existing
    // theme + armed-delete styling; the v2 markers are what the surface reads.
    wrap.className = `${TABLE_WRAP_CLASS} cm-table-wrap`;

    const table = document.createElement("table");
    table.className = "cm-table-widget";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    this.data.header.forEach((cell, col) => {
      const th = document.createElement("th");
      fillCell(th, cell, 0, col, rules);
      const align = this.data.alignments[col];
      if (align) th.style.textAlign = align;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    this.data.rows.forEach((cells, r) => {
      const tr = document.createElement("tr");
      cells.forEach((cell, col) => {
        const td = document.createElement("td");
        fillCell(td, cell, r + 1, col, rules);
        const align = this.data.alignments[col];
        if (align) td.style.textAlign = align;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  override updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const rules = view.state.facet(inlineScanRulesFacet);
    if (!dom.classList.contains(TABLE_WRAP_CLASS)) return false;
    const rows = dom.querySelectorAll("tr");
    if (rows.length !== 1 + this.data.rows.length) return false;
    const grid: TableCellData[][] = [this.data.header, ...this.data.rows];
    for (let r = 0; r < grid.length; r++) {
      const cells = rows[r].children;
      if (cells.length !== grid[r].length) return false;
    }
    for (let r = 0; r < grid.length; r++) {
      const cells = rows[r].children;
      grid[r].forEach((cell, col) => {
        fillCell(cells[col] as HTMLElement, cell, r, col, rules);
      });
    }
    return true;
  }

  // The surface owns all pointer/keyboard interaction inside the grid; CM
  // resolving those events against the atomic widget would fight it.
  override ignoreEvent(): boolean {
    return true;
  }

  override get estimatedHeight(): number {
    return this.heightEstimate;
  }
}
