/**
 * Keeps the browser's selection where the editor's is, after an edit that
 * adds or removes a line.
 *
 * To draw such an edit CodeMirror can move the text node the caret is in to
 * another line element. WebKit then moves the browser's selection, to the
 * element the node left. CodeMirror compares against the selection it last
 * read, finds the same node, and leaves it; a moment later it reads the moved
 * selection back as a caret move, one line up. CodeMirror forces its own
 * selection back for Chrome in this case, not for WebKit.
 */

import { EditorView } from "@codemirror/view";

export const selectionSync = EditorView.updateListener.of(({ view, state, startState, docChanged }) => {
  const { main } = state.selection;
  if (!docChanged || state.doc.lines === startState.doc.lines || !main.empty || !view.hasFocus || view.composing) return;
  const selection = view.dom.ownerDocument.getSelection();
  const at = selection?.anchorNode;
  if (!selection || !at || !view.contentDOM.contains(at)) return;
  if (view.posAtDOM(at, selection.anchorOffset) === main.head) return;
  const { node, offset } = view.domAtPos(main.head);
  selection.collapse(node, offset);
});
