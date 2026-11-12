/**
 * Keeps the browser's selection where the editor's is, after an edit.
 *
 * To draw an edit CodeMirror can move the text node the selection is in to
 * another element. WebKit then moves the browser's selection: to the element
 * the node left, or to a caret where a range was. CodeMirror compares against
 * the selection it last read, finds the same node, and leaves it; a moment
 * later it reads the moved selection back as a move by the user. CodeMirror
 * forces its own selection back for Chrome in this case, not for WebKit.
 *
 * Only a selection on another line, or one that lost or gained its range, is
 * put back. Within a line, two places in the source can be one place on the
 * screen, and the browser's choice between them stands.
 */

import type { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

const onOtherLine = (state: EditorState, a: number, b: number): boolean => state.doc.lineAt(a).number !== state.doc.lineAt(b).number;

export const selectionSync = EditorView.updateListener.of(({ view, state, docChanged }) => {
  if (!docChanged || !view.hasFocus || view.composing) return;
  const selection = view.dom.ownerDocument.getSelection();
  const { anchorNode, focusNode } = selection ?? {};
  if (!selection || !anchorNode || !focusNode || !view.contentDOM.contains(anchorNode) || !view.contentDOM.contains(focusNode)) return;
  const { anchor, head, empty } = state.selection.main;
  const moved =
    selection.isCollapsed !== empty ||
    onOtherLine(state, anchor, view.posAtDOM(anchorNode, selection.anchorOffset)) ||
    onOtherLine(state, head, view.posAtDOM(focusNode, selection.focusOffset));
  if (!moved) return;
  const from = view.domAtPos(anchor);
  const to = view.domAtPos(head);
  selection.setBaseAndExtent(from.node, from.offset, to.node, to.offset);
});
