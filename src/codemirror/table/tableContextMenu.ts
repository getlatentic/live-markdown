import { type ChangeSpec, type EditorState } from "@codemirror/state";
import { type EditorView } from "@codemirror/view";

import {
  addColumnAfter,
  addColumnBefore,
  addRowAbove,
  addRowBelow,
  deleteColumn,
  deleteRow,
} from "./tableEditCommands";
import { commentOnExcerptFacet } from "../core/hostFacets";
import { columnExcerptAt, rowExcerptAt } from "./tableExcerpt";

type TableCommand = (state: EditorState, pos: number) => ChangeSpec | null;

/** Previews the row/column a "Comment on this row/column" item targets. */
const HOVER_CLASS = "cm-table-cell--hover";
/** Held on a row/column's cells (styled like the hover) while the host's comment
 *  composer for it is open; the host clears it on close. */
const COMMENTING_CLASS = "cm-table-cell--commenting";

interface ShowTableMenuArgs {
  x: number;
  y: number;
  view: EditorView;
  /** A document position inside the target cell (its `data-cell-from`). */
  pos: number;
  /** When provided (tablev2), a "Select row/column/table" group is offered;
   *  the host owns the selection state. */
  selectCells?: (axis: "row" | "column" | "table") => void;
}

/** The rendered cells of the row or column the target cell sits in — located by
 *  the `data-cell-from` the widget stamps on each `<th>`/`<td>`. Used to tint
 *  the row/column a menu item is about to act on. Exported for tests. */
export function targetCells(view: EditorView, pos: number, axis: "row" | "column"): HTMLElement[] {
  const cell = view.dom.querySelector(`[data-cell-from="${pos}"]`);
  if (!(cell instanceof HTMLElement)) return [];
  const row = cell.closest("tr");
  if (!row) return [];
  if (axis === "row") {
    return Array.from(row.querySelectorAll<HTMLElement>("th, td"));
  }
  const table = cell.closest("table");
  const col = Array.from(row.children).indexOf(cell);
  if (!table || col < 0) return [];
  return Array.from(table.querySelectorAll<HTMLElement>("tr"))
    .map((tr) => tr.children[col])
    .filter((el): el is HTMLElement => el instanceof HTMLElement);
}

/** Right-click menu over a table cell: insert/delete rows and columns. Each item
 *  runs the matching {@link tableEditCommands} builder against the cell position
 *  and dispatches the change. */
export function showTableMenu(args: ShowTableMenuArgs): void {
  const menu = document.createElement("div");
  menu.className = "cm-table-menu";
  menu.setAttribute("role", "menu");
  // Styled inline: the menu mounts on document.body, outside the editor element
  // that CodeMirror scopes its theme styles to, so a stylesheet rule never
  // reaches it. Inline styles always apply.
  menu.style.cssText =
    "position:fixed;z-index:1000;display:flex;flex-direction:column;min-width:12rem;" +
    "padding:0.25rem 0;background:var(--cds-layer-01,#ffffff);" +
    "border:1px solid var(--cds-border-subtle-01,#e0e0e0);border-radius:2px;" +
    "box-shadow:0 4px 12px rgba(0,0,0,0.15);" +
    "font:0.875rem/1.4 var(--cds-body-01-font-family,-apple-system,BlinkMacSystemFont,sans-serif);";
  menu.style.left = `${args.x}px`;
  menu.style.top = `${args.y}px`;

  // Tint the row/column a menu item targets while it's hovered, so you see what
  // you're about to act on before you click. A theme class on the cells (cleared
  // on leave and on close) — distinct from the persistent `--commenting` class a
  // chosen comment leaves behind for the host to clear.
  let clearHighlight: (() => void) | null = null;
  function highlightTarget(axis: "row" | "column"): void {
    clearHighlight?.();
    const cells = targetCells(args.view, args.pos, axis);
    cells.forEach((cell) => cell.classList.add(HOVER_CLASS));
    clearHighlight = () => {
      cells.forEach((cell) => cell.classList.remove(HOVER_CLASS));
      clearHighlight = null;
    };
  }

  function destroy(): void {
    clearHighlight?.();
    menu.remove();
    document.removeEventListener("mousedown", onOutside, true);
    document.removeEventListener("keydown", onEscape, true);
  }
  function onOutside(event: MouseEvent): void {
    if (!menu.contains(event.target as Node)) destroy();
  }
  function onEscape(event: KeyboardEvent): void {
    if (event.key === "Escape") destroy();
  }

  function addAction(label: string, run: () => void, danger = false): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = danger
      ? "cm-table-menu__item cm-table-menu__item--danger"
      : "cm-table-menu__item";
    button.setAttribute("role", "menuitem");
    button.textContent = label;
    button.style.cssText =
      "appearance:none;background:transparent;border:none;text-align:left;width:100%;" +
      "padding:0.4rem 0.75rem;cursor:pointer;font:inherit;color:" +
      (danger ? "var(--cds-text-error,#da1e28)" : "var(--cds-text-primary,#161616)") +
      ";";
    button.addEventListener("mouseenter", () => {
      button.style.background = "var(--cds-layer-hover-01,#e8e8e8)";
    });
    button.addEventListener("mouseleave", () => {
      button.style.background = "transparent";
    });
    button.addEventListener("click", () => {
      run();
      destroy();
    });
    menu.appendChild(button);
    return button;
  }

  /** A structural-edit item: run the command builder and dispatch its change. */
  function add(label: string, command: TableCommand, danger = false): void {
    addAction(
      label,
      () => {
        const change = command(args.view.state, args.pos);
        if (change) {
          args.view.dispatch({ changes: change, userEvent: "input.table.structure" });
          args.view.focus();
        }
      },
      danger,
    );
  }

  function separator(): void {
    const sep = document.createElement("div");
    sep.className = "cm-table-menu__sep";
    sep.style.cssText =
      "height:1px;margin:0.25rem 0;background:var(--cds-border-subtle-01,#e0e0e0);";
    menu.appendChild(sep);
  }

  // "Comment on this row/column" — only when the host wired the facet (a desktop
  // shell with the comment composer). Hands the row/column off as an excerpt +
  // the click point; the host opens its comment composer there. The chosen
  // row/column keeps the `--commenting` tint until the host closes the composer.
  const comment = args.view.state.facet(commentOnExcerptFacet);
  if (comment) {
    function commentOn(axis: "row" | "column"): void {
      const excerpt = (axis === "row" ? rowExcerptAt : columnExcerptAt)(args.view.state, args.pos);
      if (!excerpt) return;
      targetCells(args.view, args.pos, axis).forEach((c) => c.classList.add(COMMENTING_CLASS));
      comment!(excerpt, { x: args.x, y: args.y });
    }
    const rowItem = addAction("Comment on this row", () => commentOn("row"));
    rowItem.addEventListener("mouseenter", () => highlightTarget("row"));
    rowItem.addEventListener("mouseleave", () => clearHighlight?.());
    const columnItem = addAction("Comment on this column", () => commentOn("column"));
    columnItem.addEventListener("mouseenter", () => highlightTarget("column"));
    columnItem.addEventListener("mouseleave", () => clearHighlight?.());
    separator();
  }

  if (args.selectCells) {
    const select = (axis: "row" | "column" | "table") => () => args.selectCells!(axis);
    addAction("Select row", select("row"));
    addAction("Select column", select("column"));
    addAction("Select table", select("table"));
    separator();
  }

  add("Insert row above", addRowAbove);
  add("Insert row below", addRowBelow);
  add("Delete row", deleteRow, true);
  separator();
  add("Insert column left", addColumnBefore);
  add("Insert column right", addColumnAfter);
  add("Delete column", deleteColumn, true);

  document.body.appendChild(menu);

  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = `${args.x - rect.width}px`;
  if (rect.bottom > window.innerHeight) menu.style.top = `${args.y - rect.height}px`;

  setTimeout(() => {
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onEscape, true);
  }, 0);
}
