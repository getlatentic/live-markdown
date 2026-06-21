import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";

/**
 * In-cell editor: a small CodeMirror view holding ONE table cell's raw markdown.
 * Edits stay local to this view until focus leaves, then the whole cell is
 * written back to the main document as a single transaction. Committing only on
 * blur means the main doc — and the table widget it drives — never churns
 * mid-keystroke, so the widget DOM (and this subview mounted inside it) survives
 * until the edit lands, and a cell edit is one clean undo step.
 */

/** A literal `\n` would break the table row, so reject any change that inserts
 *  one. (Tab / Enter navigation between cells lands in a later phase.) */
const singleLine = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return tr;
  let multiline = false;
  tr.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
    if (inserted.lines > 1) multiline = true;
  });
  return multiline ? [] : tr;
});

/** Strip the editor chrome so the cell editor reads as inline cell text. */
const cellTheme = EditorView.theme({
  "&": { font: "inherit", color: "inherit" },
  "&.cm-focused": { outline: "none" },
  ".cm-content": { padding: "0", caretColor: "currentColor" },
  ".cm-line": { padding: "0" },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "inherit" },
});

export interface CellSubview {
  view: EditorView;
  /** Write the edited text back to the main doc (if changed) and tear down. */
  commit(): void;
}

/**
 * Mount a cell editor into `cell`, seeded with the document source at
 * `[from, to)`. Returns a handle; the view also commits itself on blur.
 */
export function mountCellSubview(
  cell: HTMLElement,
  mainView: EditorView,
  from: number,
  to: number,
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

  view = new EditorView({
    state: EditorState.create({
      doc: original,
      extensions: [
        history(),
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
