/**
 * V2 table widget (ADR 0001): pure render, stable lifecycle, no editors inside.
 *
 * Lifecycle contract — the make-or-break constraint:
 *   - `eq` compares source anchors + data, so ANY doc change (offsets shift)
 *     makes CM consult `updateDOM`.
 *   - `updateDOM` patches cell contents IN PLACE (element identity preserved)
 *     and re-stamps the source anchor; it declines (→ full recreate) only when
 *     the grid SHAPE changed.
 *   - After either path, the tableV2 extension calls the active surface's
 *     `reanchor` so an in-progress cell edit survives.
 *
 * Editing is delegated entirely to a {@link CellEditingSurface}; this file has
 * no caret, focus, or selection logic by design.
 */

import { syntaxTree } from "@codemirror/language";
import { type EditorState, StateField, type Extension, type Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";

import { renderCellInto } from "../decorations/tableCell";
import { parseTableNode, type TableCellData, type TableData } from "../decorations/tableModel";
import { type CellEditingSurface } from "./cellEditingSurface";
import { tableV2Sync } from "./tableV2Sync";

function fillCell(el: HTMLElement, cell: TableCellData, row: number, col: number): void {
  renderCellInto(el, cell.html);
  el.dataset.row = String(row);
  el.dataset.col = String(col);
  // The structure menu's row/column hover-tint locates cells by source pos.
  el.dataset.cellFrom = String(cell.from);
}

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

export class TableWidgetV2 extends WidgetType {
  private readonly heightEstimate: number;

  constructor(
    readonly data: TableData,
    readonly sourceFrom: number,
    readonly sourceTo: number,
  ) {
    super();
    this.heightEstimate = estimateTableHeight(data);
  }

  override eq(other: TableWidgetV2): boolean {
    return (
      other.sourceFrom === this.sourceFrom &&
      other.sourceTo === this.sourceTo &&
      JSON.stringify(other.data) === JSON.stringify(this.data)
    );
  }

  override toDOM(): HTMLElement {
    const wrap = document.createElement("div");
    // Both generations of class/stamp: cm-table-wrap carries the existing
    // theme + armed-delete styling; the v2 markers are what the surface reads.
    wrap.className = "cm-tablev2-wrap cm-table-wrap";
    wrap.dataset.tablev2From = String(this.sourceFrom);
    wrap.dataset.tableFrom = String(this.sourceFrom);

    const table = document.createElement("table");
    table.className = "cm-table-widget";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    this.data.header.forEach((cell, col) => {
      const th = document.createElement("th");
      fillCell(th, cell, 0, col);
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
        fillCell(td, cell, r + 1, col);
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

  override updateDOM(dom: HTMLElement): boolean {
    if (dom.dataset.tablev2From === undefined) return false;
    const rows = dom.querySelectorAll("tr");
    if (rows.length !== 1 + this.data.rows.length) return false;
    const grid: TableCellData[][] = [this.data.header, ...this.data.rows];
    for (let r = 0; r < grid.length; r++) {
      const cells = rows[r].children;
      if (cells.length !== grid[r].length) return false;
    }
    dom.dataset.tablev2From = String(this.sourceFrom);
    dom.dataset.tableFrom = String(this.sourceFrom);
    for (let r = 0; r < grid.length; r++) {
      const cells = rows[r].children;
      grid[r].forEach((cell, col) => {
        fillCell(cells[col] as HTMLElement, cell, r, col);
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

function buildDecorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "Table") return;
      for (const model of parseTableNode(state, node.node)) {
        ranges.push(
          Decoration.replace({
            widget: new TableWidgetV2(model.data, model.from, model.to),
            block: true,
          }).range(model.from, model.to),
        );
      }
    },
  });
  return Decoration.set(ranges, true);
}

/** The V2 table extension: widget field + surface synchronisation. */
export function tableV2(surface: CellEditingSurface): Extension {
  const field = StateField.define<DecorationSet>({
    create: buildDecorations,
    update(value, tr) {
      if (tr.docChanged || syntaxTree(tr.state) !== syntaxTree(tr.startState)) {
        return buildDecorations(tr.state);
      }
      return value;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
  return [field, tableV2Sync(surface)];
}
