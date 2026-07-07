/**
 * Whole-cell visual selection (feature scenarios 11–13). A drag across cells
 * never produces a ragged native text selection — it selects whole cells,
 * painted with a class; copy serialises the selected rectangle as TSV from
 * the CURRENT document. Selection is transient: any document change clears it.
 *
 * The rectangle math is pure and dimension-based so the @pure tier can
 * enumerate it without a model or DOM.
 */

import { type EditorView } from "@codemirror/view";

import { cellAt } from "../decorations/tableCellNav";
import { modelAt } from "../decorations/tableGeometry";
import { type CellRef, cellElement } from "./cellEditingSurface";
import { unescapePipes } from "./cellText";

// The V1 theme already styles this class; reuse it wholesale.
export const SELECTED_CLASS = "cm-table-cell--selected";

export interface CellRect {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

/** The normalised rectangle spanned by two cells. */
export function rectOf(a: CellRef, b: CellRef): CellRect {
  return {
    r0: Math.min(a.row, b.row),
    c0: Math.min(a.col, b.col),
    r1: Math.max(a.row, b.row),
    c1: Math.max(a.col, b.col),
  };
}

/** Every cell in `rect`, row-major. */
export function refsIn(rect: CellRect): CellRef[] {
  const refs: CellRef[] = [];
  for (let row = rect.r0; row <= rect.r1; row++) {
    for (let col = rect.c0; col <= rect.c1; col++) refs.push({ row, col });
  }
  return refs;
}

/** One whole column of a `rows`-high grid (row 0 = header). */
export function columnRect(rows: number, col: number): CellRect {
  return { r0: 0, c0: col, r1: rows - 1, c1: col };
}

/** One whole row of a `cols`-wide grid. */
export function rowRect(cols: number, row: number): CellRect {
  return { r0: row, c0: 0, r1: row, c1: cols - 1 };
}

/** The whole grid. */
export function tableRect(rows: number, cols: number): CellRect {
  return { r0: 0, c0: 0, r1: rows - 1, c1: cols - 1 };
}

export class CellSelectionController {
  private sel: { tableFrom: number; rect: CellRect } | null = null;

  set(view: EditorView, tableFrom: number, rect: CellRect): void {
    this.unpaint(view);
    this.sel = { tableFrom, rect };
    for (const ref of refsIn(rect)) {
      cellElement(view, tableFrom, ref)?.classList.add(SELECTED_CLASS);
    }
  }

  get(): { tableFrom: number; rect: CellRect } | null {
    return this.sel;
  }

  clear(view: EditorView): void {
    this.unpaint(view);
    this.sel = null;
  }

  /** The selected rectangle as TSV, resolved from the current document. */
  tsv(view: EditorView): string | null {
    const s = this.sel;
    if (!s) return null;
    const model = modelAt(view.state, s.tableFrom);
    if (!model) return null;
    const lines: string[] = [];
    for (let row = s.rect.r0; row <= s.rect.r1; row++) {
      const cells: string[] = [];
      for (let col = s.rect.c0; col <= s.rect.c1; col++) {
        const cell = cellAt(model, row, col);
        cells.push(cell ? unescapePipes(view.state.sliceDoc(cell.from, cell.to)) : "");
      }
      lines.push(cells.join("\t"));
    }
    return lines.join("\n");
  }

  private unpaint(view: EditorView): void {
    view.dom
      .querySelectorAll(`.${SELECTED_CLASS}`)
      .forEach((el) => el.classList.remove(SELECTED_CLASS));
  }
}
