import { EditorView, ViewPlugin } from "@codemirror/view";

/**
 * Uniform drag-selection for table cells.
 *
 * The grid is `user-select:none` (see editorTheme.ts), so a mouse drag can't
 * paint the browser's native table selection — which zig-zags anchor→focus in
 * document order and highlights cells to ragged heights. Instead this plugin
 * tracks the drag itself and tints the whole rectangle of cells between the
 * press and the pointer, so a row, a column, or a block highlights evenly.
 *
 * A press that doesn't move stays a click (the widget mounts its cell editor);
 * a left press elsewhere clears the selection; a right press preserves it so the
 * context menu can still act. Copy writes the selected cells as TSV.
 */

const SELECTED = "cm-table-cell--selected";

/** The table cell under `target` (with its source range stamped), or null. */
function cellAt(target: EventTarget | null): HTMLElement | null {
  const el =
    target instanceof HTMLElement
      ? target.closest<HTMLElement>(".cm-table-widget th, .cm-table-widget td")
      : null;
  return el && el.dataset.cellFrom !== undefined ? el : null;
}

/** A cell's table + its (row, col) by DOM position, or null. */
function cellCoord(cell: HTMLElement): { table: HTMLElement; row: number; col: number } | null {
  const tr = cell.closest("tr");
  const table = cell.closest<HTMLElement>("table");
  if (!tr || !table) return null;
  const row = Array.from(table.querySelectorAll("tr")).indexOf(tr);
  const col = Array.from(tr.children).indexOf(cell);
  return row >= 0 && col >= 0 ? { table, row, col } : null;
}

export function clearCellSelection(root: ParentNode): void {
  root.querySelectorAll("." + SELECTED).forEach((cell) => cell.classList.remove(SELECTED));
}

/** Tint every cell in the rectangle spanned by the two (row, col) corners. */
export function selectCellRect(
  table: HTMLElement,
  a: { row: number; col: number },
  b: { row: number; col: number },
): void {
  clearCellSelection(table);
  const rows = Array.from(table.querySelectorAll("tr"));
  const [r0, r1] = [Math.min(a.row, b.row), Math.max(a.row, b.row)];
  const [c0, c1] = [Math.min(a.col, b.col), Math.max(a.col, b.col)];
  for (let r = r0; r <= r1; r++) {
    const cells = rows[r]?.children;
    for (let c = c0; c <= c1 && cells; c++) {
      (cells[c] as HTMLElement | undefined)?.classList.add(SELECTED);
    }
  }
}

/** Selected cells as TSV (tab between columns, newline between rows). */
export function selectionTsv(root: ParentNode): string {
  const byRow = new Map<Element, string[]>();
  for (const cell of root.querySelectorAll<HTMLElement>("." + SELECTED)) {
    const tr = cell.closest("tr");
    if (!tr) continue;
    const cols = byRow.get(tr) ?? [];
    cols.push(cell.textContent?.trim() ?? "");
    byRow.set(tr, cols);
  }
  return Array.from(byRow.values(), (cols) => cols.join("\t")).join("\n");
}

class TableCellSelection {
  private onMove: ((event: MouseEvent) => void) | null = null;
  private onUp: (() => void) | null = null;

  constructor(private readonly view: EditorView) {
    view.dom.addEventListener("mousedown", this.handleMouseDown);
    view.dom.addEventListener("copy", this.handleCopy);
  }

  private handleMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0) return; // right-click: keep selection for the menu
    clearCellSelection(this.view.dom);
    const cell = cellAt(event.target);
    if (!cell || cell.querySelector(".cm-editor")) return; // empty area, or editing
    const anchor = cellCoord(cell);
    if (!anchor) return;
    let dragged = false;
    this.onMove = (move) => {
      const overCell = cellAt(move.target);
      const focus = overCell ? cellCoord(overCell) : null;
      if (!focus || focus.table !== anchor.table) return;
      if (focus.row !== anchor.row || focus.col !== anchor.col) {
        dragged = true;
        selectCellRect(anchor.table, anchor, focus);
      }
    };
    this.onUp = () => {
      this.detach();
      // A press that never left its cell is a click → leave it to mount the
      // cell editor, with no lingering one-cell selection.
      if (!dragged) clearCellSelection(this.view.dom);
    };
    document.addEventListener("mousemove", this.onMove, true);
    document.addEventListener("mouseup", this.onUp, true);
  };

  private handleCopy = (event: ClipboardEvent): void => {
    const tsv = selectionTsv(this.view.dom);
    if (!tsv) return;
    event.clipboardData?.setData("text/plain", tsv);
    event.preventDefault();
  };

  private detach(): void {
    if (this.onMove) document.removeEventListener("mousemove", this.onMove, true);
    if (this.onUp) document.removeEventListener("mouseup", this.onUp, true);
    this.onMove = this.onUp = null;
  }

  destroy(): void {
    this.view.dom.removeEventListener("mousedown", this.handleMouseDown);
    this.view.dom.removeEventListener("copy", this.handleCopy);
    this.detach();
  }
}

export const tableSelectionPlugin = ViewPlugin.fromClass(TableCellSelection);
