/**
 * The interaction wiring around a {@link CellEditingSurface} (ADR 0001):
 *
 *   - pointer: one press lifecycle owns the mouse. A press that stays in its
 *     cell is a CLICK → edit begins on release with the caret at the pressed
 *     point (caretRangeFromPoint). A press that crosses into another cell is a
 *     DRAG → whole-cell selection (never a ragged native text selection).
 *     Presses inside the active editing element stay native. Handled by
 *     NATIVE listeners because the widget's `ignoreEvent() → true` hides
 *     these events from CodeMirror — which is also what keeps a table click
 *     from ever moving the main caret.
 *   - keys: a document-capture keydown runs {@link bridgeKey} while an edit is
 *     active — mid-text keys stay native; boundary keys commit and step to the
 *     neighbour cell or exit to the main document (exitCaretPos).
 *   - copy: with a cell selection active, copy yields TSV.
 *   - context menu: right-click on a cell opens the structure menu
 *     (insert/delete row/column) targeting that cell's position.
 *   - entry: ArrowDown/ArrowUp in the MAIN editor next to a table enters its
 *     first/last row (the table is an atomic block the caret can't land on).
 */

import { Prec } from "@codemirror/state";
import { EditorView, ViewPlugin, keymap } from "@codemirror/view";
import { type Extension } from "@codemirror/state";

import { showTableMenu } from "../decorations/tableContextMenu";
import { exitCaretPos, rowCount } from "../decorations/tableCellNav";
import { modelAt } from "../decorations/tableGeometry";
import {
  type CellEditingSurface,
  type CellRef,
  cellRange,
  offsetAtPoint,
  visualEdges,
} from "./cellEditingSurface";
import { type BridgeKey, bridgeKey, gridSize } from "./bridgeRules";
import { CellSelectionController, rectOf } from "./tableV2Selection";

function refOf(cellEl: HTMLElement): CellRef {
  return { row: Number(cellEl.dataset.row), col: Number(cellEl.dataset.col) };
}

function hitCell(target: EventTarget | null): { cellEl: HTMLElement; tableFrom: number } | null {
  if (!(target instanceof HTMLElement)) return null;
  const cellEl = target.closest?.("[data-row][data-col]");
  const wrap = target.closest?.("[data-tablev2-from]");
  if (!(cellEl instanceof HTMLElement) || !(wrap instanceof HTMLElement)) return null;
  return { cellEl, tableFrom: Number(wrap.dataset.tablev2From) };
}

/** Map a KeyboardEvent to a bridge key; null = not the bridge's business. */
function bridgeKeyOf(event: KeyboardEvent): BridgeKey | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  switch (event.key) {
    case "Tab":
      return event.shiftKey ? "Shift-Tab" : "Tab";
    case "ArrowRight":
    case "ArrowLeft":
    case "ArrowUp":
    case "ArrowDown":
    case "Backspace":
    case "Delete":
    case "Enter":
      return event.shiftKey ? null : (event.key as BridgeKey);
    default:
      return null;
  }
}

interface Press {
  tableFrom: number;
  startRef: CellRef;
  startX: number;
  startY: number;
  dragged: boolean;
}

function pointerPlugin(surface: CellEditingSurface, selection: CellSelectionController) {
  return ViewPlugin.define((view) => {
    let press: Press | null = null;

    const onMouseMove = (event: MouseEvent): void => {
      if (!press) return;
      const hit = hitCell(event.target);
      if (!hit || hit.tableFrom !== press.tableFrom) return;
      const ref = refOf(hit.cellEl);
      const crossed = ref.row !== press.startRef.row || ref.col !== press.startRef.col;
      if (crossed || press.dragged) {
        press.dragged = true;
        selection.set(view, press.tableFrom, rectOf(press.startRef, ref));
      }
    };

    const onMouseUp = (): void => {
      const p = press;
      press = null;
      window.removeEventListener("mousemove", onMouseMove, true);
      window.removeEventListener("mouseup", onMouseUp, true);
      if (!p || p.dragged) return; // a drag leaves its selection standing
      if (!surface.begin(view, p.tableFrom, p.startRef, 0)) return;
      const el = surface.editingElement();
      if (!el) return;
      const offset = offsetAtPoint(el, p.startX, p.startY);
      surface.placeCaret(offset ?? surface.active()!.text.length);
    };

    const onMouseDown = (event: MouseEvent): void => {
      if (event.button !== 0) return;
      const editing = surface.editingElement();
      if (editing && event.target instanceof Node && editing.contains(event.target)) return;
      const hit = hitCell(event.target);
      if (!hit) {
        // A press outside any table (prose, gutters): selection is done.
        selection.clear(view);
        return;
      }
      event.preventDefault();
      surface.commit(view);
      selection.clear(view);
      press = {
        tableFrom: hit.tableFrom,
        startRef: refOf(hit.cellEl),
        startX: event.clientX,
        startY: event.clientY,
        dragged: false,
      };
      window.addEventListener("mousemove", onMouseMove, true);
      window.addEventListener("mouseup", onMouseUp, true);
    };

    const onContextMenu = (event: MouseEvent): void => {
      const hit = hitCell(event.target);
      if (!hit) return;
      event.preventDefault();
      surface.commit(view);
      const range = cellRange(view.state, hit.tableFrom, refOf(hit.cellEl));
      if (!range) return;
      showTableMenu({ x: event.clientX, y: event.clientY, view, pos: range.from });
    };

    const onCopy = (event: ClipboardEvent): void => {
      const tsv = selection.tsv(view);
      if (tsv === null) return;
      event.clipboardData?.setData("text/plain", tsv);
      event.preventDefault();
    };

    view.dom.addEventListener("mousedown", onMouseDown);
    view.dom.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("copy", onCopy, true);
    return {
      update(update: { docChanged: boolean }) {
        // Cell geometry changed under the selection: transient by design.
        if (update.docChanged) selection.clear(view);
      },
      destroy() {
        view.dom.removeEventListener("mousedown", onMouseDown);
        view.dom.removeEventListener("contextmenu", onContextMenu);
        document.removeEventListener("copy", onCopy, true);
        window.removeEventListener("mousemove", onMouseMove, true);
        window.removeEventListener("mouseup", onMouseUp, true);
      },
    };
  });
}

function keyPlugin(surface: CellEditingSurface) {
  return ViewPlugin.define((view) => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const el = surface.editingElement();
      if (!el || !(event.target instanceof Node) || !el.contains(event.target)) return;
      const key = bridgeKeyOf(event);
      if (!key) return;
      const active = surface.active();
      const tableFrom = surface.anchor();
      if (!active || tableFrom === null) return;
      const model = modelAt(view.state, tableFrom);
      if (!model) return;
      const action = bridgeKey(
        {
          ...gridSize(model),
          row: active.ref.row,
          col: active.ref.col,
          offset: active.caret,
          length: active.text.length,
          ...visualEdges(el),
        },
        key,
      );
      if (action.kind === "native") return;
      event.preventDefault();
      surface.commit(view);
      if (action.kind === "focusCell") {
        surface.begin(
          view,
          tableFrom,
          { row: action.row, col: action.col },
          action.caret === "end" ? Number.MAX_SAFE_INTEGER : 0,
        );
        return;
      }
      const after = modelAt(view.state, tableFrom);
      if (!after) return;
      const pos = exitCaretPos(
        action.edge === "before" ? "above" : "below",
        after.from,
        after.to,
        view.state.doc.length,
      );
      view.focus();
      view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    };
    document.addEventListener("keydown", onKeyDown, true);
    return {
      destroy() {
        document.removeEventListener("keydown", onKeyDown, true);
      },
    };
  });
}

/** Enter the table's first/last row when vertical motion in the main editor
 *  reaches it — the block widget itself can't hold the caret. */
function enterTable(view: EditorView, surface: CellEditingSurface, dir: "up" | "down"): boolean {
  const { main } = view.state.selection;
  if (!main.empty) return false;
  const doc = view.state.doc;
  const line = doc.lineAt(main.head);
  const neighbour = dir === "down" ? line.number + 1 : line.number - 1;
  if (neighbour < 1 || neighbour > doc.lines) return false;
  const target = doc.line(neighbour);
  // Probe INSIDE the neighbour line: its end sits on the table node's own end
  // boundary, which side-sensitive resolution misses.
  const probe = dir === "down" ? target.from : Math.max(target.from, target.to - 1);
  const model = modelAt(view.state, probe);
  if (!model) return false;
  const ref: CellRef =
    dir === "down" ? { row: 0, col: 0 } : { row: rowCount(model) - 1, col: 0 };
  return surface.begin(view, model.from, ref, 0);
}

/** All interaction wiring for the V2 table; compose with `tableV2(surface)`. */
export function tableV2Interaction(surface: CellEditingSurface): Extension {
  const selection = new CellSelectionController();
  return [
    pointerPlugin(surface, selection),
    keyPlugin(surface),
    Prec.high(
      keymap.of([
        { key: "ArrowDown", run: (view) => enterTable(view, surface, "down") },
        { key: "ArrowUp", run: (view) => enterTable(view, surface, "up") },
      ]),
    ),
  ];
}
