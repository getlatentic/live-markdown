/**
 * §12.9 — a closed fence's marker rows never hold the caret.
 *
 * The opener/closer lines are block chrome: a caret parked there types
 * somewhere else (the §12.7 re-site), which reads as a jump. Instead the
 * caret is re-placed the moment a selection lands on a marker row:
 *
 *   - pointer clicks: nearest content edge (opener → first content line's
 *     start, closer → last content line's end)
 *   - forward motion (Down/Right): through the row into the block, or out
 *     below it; holds at the content edge when nothing follows the block
 *   - backward motion (Up/Left): out above the block, or back to content
 *
 * A fence currently rendered as a BLOCK WIDGET (a mermaid diagram) inverts
 * the rule: moving the caret INTO its content would reveal the source — so a
 * click landing beside the widget flipped the diagram to code. Those fences
 * snap the caret to the boundary OUTSIDE the block instead; entering one is
 * a deliberate act (double-click / Edit chip / click-to-edit).
 *
 * Unclosed fences keep the caret — typing a language on a pasted opener
 * needs it — and blocks with no content line are left alone (§12.7 re-sites
 * any typing there safely). Range selections and multi-cursor pass through.
 */

import { EditorSelection, EditorState, type Transaction } from "@codemirror/state";

import { fenceAt } from "./fenceAutoClose";
import { mermaidField } from "./mermaidPlugin";

/** Is this fence currently replaced by a rendered block widget? */
function widgetCovered(state: EditorState, from: number, to: number): boolean {
  const field = state.field(mermaidField, false);
  if (!field) return false;
  let covered = false;
  field.decorations.between(from, to, () => {
    covered = true;
    return false;
  });
  return covered;
}

export const fenceCaretGuard = EditorState.transactionFilter.of((tr: Transaction) => {
  if (tr.docChanged || !tr.selection) return tr;
  if (tr.selection.ranges.length > 1) return tr;
  const sel = tr.selection.main;
  if (!sel.empty) return tr;

  const state = tr.startState;
  const line = state.doc.lineAt(sel.head);
  if (line.to === line.from) return tr;
  const node = fenceAt(state, line.to);
  if (!node) return tr;
  const marks = node.getChildren("CodeMark");
  if (marks.length < 2) return tr;

  const openerLine = state.doc.lineAt(node.from);
  const closerLine = state.doc.lineAt(marks[marks.length - 1].from);
  if (closerLine.number - openerLine.number < 2) return tr;
  const onOpener = line.number === openerLine.number;
  if (!onOpener && line.number !== closerLine.number) return tr;

  const oldHead = state.selection.main.head;
  const pointer = tr.isUserEvent("select.pointer");
  const backward = !pointer && sel.head < oldHead;

  let target: number;
  if (widgetCovered(state, node.from, node.to)) {
    target = onOpener ? openerLine.from : closerLine.to;
  } else {
    const contentStart = openerLine.to + 1;
    const lastContentEnd = closerLine.from - 1;
    if (onOpener) {
      target = backward && openerLine.from > 0 ? openerLine.from - 1 : contentStart;
    } else if (pointer || backward) {
      target = lastContentEnd;
    } else {
      target = closerLine.to < state.doc.length ? closerLine.to + 1 : lastContentEnd;
    }
  }
  if (target === sel.head) return tr;
  return [tr, { selection: EditorSelection.cursor(target), sequential: true }];
});
