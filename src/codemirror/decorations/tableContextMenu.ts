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
import { sendToAssistantFacet } from "./hostFacets";
import { columnExcerptAt, rowExcerptAt } from "./tableExcerpt";

type TableCommand = (state: EditorState, pos: number) => ChangeSpec | null;

interface ShowTableMenuArgs {
  x: number;
  y: number;
  view: EditorView;
  /** A document position inside the target cell (its `data-cell-from`). */
  pos: number;
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

  function destroy(): void {
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

  function addAction(label: string, run: () => void, danger = false): void {
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

  // "Ask the assistant about this row/column" — only when the host wired the
  // facet (a desktop shell with a chat panel). Hands the row/column off as a
  // quoted excerpt; the host takes the question and streams the reply.
  const sendToAssistant = args.view.state.facet(sendToAssistantFacet);
  if (sendToAssistant) {
    addAction("Ask the assistant about this row", () => {
      const excerpt = rowExcerptAt(args.view.state, args.pos);
      if (excerpt) sendToAssistant(excerpt);
    });
    addAction("Ask the assistant about this column", () => {
      const excerpt = columnExcerptAt(args.view.state, args.pos);
      if (excerpt) sendToAssistant(excerpt);
    });
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
