/**
 * The interaction wiring around a {@link CellEditingSurface} (ADR 0001):
 *
 *   - pointer: mousedown on a rendered cell begins an edit with the caret at
 *     the click point; clicks inside the active editing element stay native.
 *     Handled by a NATIVE capture listener because the widget's
 *     `ignoreEvent() → true` hides these events from CodeMirror's handlers —
 *     which is also what keeps a table click from ever moving the main caret.
 *   - keys: a document-capture keydown runs {@link bridgeKey} while an edit is
 *     active — mid-text keys stay native; boundary keys commit and step to the
 *     neighbour cell or exit to the main document (exitCaretPos).
 *   - entry: ArrowDown/ArrowUp in the MAIN editor next to a table enters its
 *     first/last row (the table is an atomic block the caret can't land on).
 */

import { Prec } from "@codemirror/state";
import { EditorView, ViewPlugin, keymap } from "@codemirror/view";
import { type Extension } from "@codemirror/state";

import { exitCaretPos, rowCount } from "../decorations/tableCellNav";
import { modelAt } from "../decorations/tableGeometry";
import {
  type CellEditingSurface,
  type CellRef,
  offsetAtPoint,
  visualEdges,
} from "./cellEditingSurface";
import { type BridgeKey, bridgeKey, gridSize } from "./bridgeRules";

function refOf(cellEl: HTMLElement): CellRef {
  return { row: Number(cellEl.dataset.row), col: Number(cellEl.dataset.col) };
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

function pointerPlugin(surface: CellEditingSurface) {
  return ViewPlugin.define((view) => {
    const onMouseDown = (event: MouseEvent): void => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement;
      // Clicks inside the active editing element: native caret movement.
      const editing = surface.editingElement();
      if (editing && editing.contains(target)) return;
      const cellEl = target.closest?.("[data-row][data-col]");
      const wrap = target.closest?.("[data-tablev2-from]");
      if (!(cellEl instanceof HTMLElement) || !(wrap instanceof HTMLElement)) return;
      event.preventDefault();
      surface.commit(view);
      const tableFrom = Number(wrap.dataset.tablev2From);
      if (!surface.begin(view, tableFrom, refOf(cellEl), 0)) return;
      const el = surface.editingElement();
      if (!el) return;
      const offset = offsetAtPoint(el, event.clientX, event.clientY);
      surface.placeCaret(offset ?? surface.active()!.text.length);
    };
    view.dom.addEventListener("mousedown", onMouseDown);
    return {
      destroy() {
        view.dom.removeEventListener("mousedown", onMouseDown);
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
  return [
    pointerPlugin(surface),
    keyPlugin(surface),
    Prec.high(
      keymap.of([
        { key: "ArrowDown", run: (view) => enterTable(view, surface, "down") },
        { key: "ArrowUp", run: (view) => enterTable(view, surface, "up") },
      ]),
    ),
  ];
}
