import { EditorSelection, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";

import { modelAt } from "./tableGeometry";
import { cellAt, type NavDir, positionOf, stepCell } from "./tableCellNav";

/**
 * In-cell editor: a small CodeMirror view holding ONE table cell's raw markdown.
 * Edits stay local to this view until focus leaves, then the whole cell is
 * written back to the main document as a single transaction. Committing only on
 * blur means the main doc — and the table widget it drives — never churns
 * mid-keystroke, so the widget DOM (and this subview mounted inside it) survives
 * until the edit lands, and a cell edit is one clean undo step.
 *
 * Given the table's source start (`sourceFrom`), the cell also navigates: Tab /
 * Shift-Tab and the arrow keys at a cell edge move to the adjacent cell (or out
 * of the table), so the grid is keyboard-traversable even though it's one atomic
 * block in the main editor (see {@link tableCellNav}).
 */

/** A literal `\n` would break the table row, so reject any change that inserts
 *  one. (Enter/typing newlines; cell-to-cell motion is the nav keymap below.) */
const singleLine = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return tr;
  let multiline = false;
  tr.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
    if (inserted.lines > 1) multiline = true;
  });
  return multiline ? [] : tr;
});

/**
 * Strip the editor chrome so the cell editor reads as inline cell text.
 *
 * The subview's DOM is a *descendant* of the main editor's root, so the main
 * `editorBaseTheme` (scoped to that root) also matches this subview's
 * `.cm-scroller` / `.cm-content`. That's where the cell picked up the main
 * editor's big scroller padding (a tall row) and `margin: 0 auto` (centered
 * text). We override those here so the cell editor matches the rendered cell:
 * inherited font/size/line-height, left-aligned, no extra padding/margin/height.
 */
const cellTheme = EditorView.theme({
  "&": { font: "inherit", color: "inherit", background: "transparent" },
  "&.cm-focused": { outline: "none" },
  // `!important` is load-bearing: the main editor theme's `.cm-scroller`/
  // `.cm-content` rules match the subview too (same specificity) and win on
  // source order, so a plain value here loses. Devtools confirmed the cell was
  // inheriting `padding: 1.5rem 3rem` (the tall row) and `margin: 0 auto` (the
  // centering); `!important` beats those non-important rules unconditionally.
  ".cm-scroller": {
    font: "inherit",
    lineHeight: "inherit",
    overflow: "visible",
    height: "auto",
    padding: "0 !important",
  },
  ".cm-content": {
    font: "inherit",
    lineHeight: "inherit",
    textAlign: "left",
    padding: "0",
    margin: "0 !important",
    maxWidth: "none !important",
    minHeight: "0",
    flexGrow: "0",
    caretColor: "currentColor",
  },
  ".cm-line": { padding: "0", lineHeight: "inherit" },
});

export interface CellSubview {
  view: EditorView;
  /** Write the edited text back to the main doc (if changed) and tear down. */
  commit(): void;
}

const atStart = (view: EditorView): boolean => {
  const sel = view.state.selection.main;
  return sel.empty && sel.head === 0;
};
const atEnd = (view: EditorView): boolean => {
  const sel = view.state.selection.main;
  return sel.empty && sel.head === view.state.doc.length;
};

/** Mount the editor for the cell at (row, col) in the table whose source starts
 *  at `sourceFrom`. Used to enter a table from the surrounding text and to step
 *  between cells. Returns false when the cell or its rendered element is gone. */
export function mountTableCellAt(
  mainView: EditorView,
  sourceFrom: number,
  row: number,
  col: number,
): boolean {
  const model = modelAt(mainView.state, sourceFrom);
  if (!model) return false;
  const target = cellAt(model, row, col);
  if (!target) return false;
  const el = mainView.dom.querySelector(`[data-cell-from="${target.from}"]`);
  if (!(el instanceof HTMLElement)) return false;
  mountCellSubview(el, mainView, target.from, target.to, sourceFrom);
  return true;
}

/**
 * Mount a cell editor into `cell`, seeded with the document source at
 * `[from, to)`. With `sourceFrom` (the table's source start) the cell also wires
 * keyboard navigation to adjacent cells. Returns a handle; the view also commits
 * itself on blur.
 */
export function mountCellSubview(
  cell: HTMLElement,
  mainView: EditorView,
  from: number,
  to: number,
  sourceFrom?: number,
): CellSubview {
  const original = mainView.state.sliceDoc(from, to);
  const renderedHTML = cell.innerHTML;
  let done = false;
  let view!: EditorView;

  function commit(): void {
    if (done) return;
    done = true;
    const next = view.state.doc.toString();
    if (next !== original) {
      // The doc change rebuilds the whole table widget, re-rendering this cell.
      mainView.dispatch({
        changes: { from, to, insert: next },
        userEvent: "input.table.cell",
      });
    } else {
      // Unchanged: the doc won't churn, so nothing else re-renders the cell —
      // put its rendered HTML back ourselves.
      cell.innerHTML = renderedHTML;
    }
    // Defer past the current event (the blur that triggered us) before tearing
    // the view down, so CM isn't destroyed mid-dispatch.
    queueMicrotask(() => view.destroy());
  }

  // Leave this cell in `dir`. Resolve the target against the pre-commit model
  // (this cell's `from` is stable across its own edit), then commit — which may
  // re-render the grid — and re-parse before mounting the target cell or
  // dropping the caret back into the main document at the exit edge.
  function navigate(dir: NavDir): void {
    if (sourceFrom === undefined) return;
    const before = modelAt(mainView.state, sourceFrom);
    const here = before ? positionOf(before, from) : null;
    if (!before || !here) return;
    const target = stepCell(before, here.row, here.col, dir);
    commit();
    const after = modelAt(mainView.state, sourceFrom);
    if (!after) return;
    if (target.kind === "cell") {
      mountTableCellAt(mainView, sourceFrom, target.row, target.col);
      return;
    }
    // Exit just OUTSIDE the table. Above/before must land one position before
    // the table's `from`: a caret placed AT `from` sits at the atomic block's
    // front edge and CodeMirror shoves it forward past the whole table (landing
    // it *below*). `to` is already past the table, so below/after uses it as-is.
    const pos =
      target.edge === "above" || target.edge === "before"
        ? Math.max(0, after.from - 1)
        : after.to;
    mainView.focus();
    mainView.dispatch({
      selection: EditorSelection.cursor(pos),
      userEvent: "select",
      scrollIntoView: true,
    });
  }

  const move = (dir: NavDir) => {
    navigate(dir);
    return true;
  };
  const navKeymap =
    sourceFrom === undefined
      ? []
      : Prec.high(
          keymap.of([
            { key: "Tab", run: () => move("next") },
            { key: "Shift-Tab", run: () => move("prev") },
            { key: "ArrowDown", run: () => move("down") },
            { key: "ArrowUp", run: () => move("up") },
            { key: "ArrowRight", run: (v) => (atEnd(v) ? move("next") : false) },
            { key: "ArrowLeft", run: (v) => (atStart(v) ? move("prev") : false) },
          ]),
        );

  view = new EditorView({
    state: EditorState.create({
      doc: original,
      extensions: [
        history(),
        // Navigation beats defaultKeymap's arrow/Tab handling; the edge checks
        // fall through (return false) to it for motion within the cell text.
        navKeymap,
        keymap.of([...historyKeymap, ...defaultKeymap]),
        EditorView.lineWrapping,
        singleLine,
        cellTheme,
        EditorView.domEventHandlers({
          blur: () => {
            commit();
            return false;
          },
        }),
      ],
    }),
  });

  cell.textContent = "";
  cell.appendChild(view.dom);
  view.focus();
  return { view, commit };
}
