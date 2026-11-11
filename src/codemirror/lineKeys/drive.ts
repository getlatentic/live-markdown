/**
 * Drives the editor's own key bindings and typing rules from a test: the same
 * extension list the editor component loads, with keys delivered the way
 * CodeMirror delivers them.
 */

import { ensureSyntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, runScopeHandlers } from "@codemirror/view";

import { markdownDecorationsPlugin } from "../core";
import { editingStack } from "../editingStack";
import { mergeExtensions, tableExtension } from "../extensions";

const EXTENSIONS = [...editingStack, markdownDecorationsPlugin, ...mergeExtensions([tableExtension()]).extensions];

export const CARET = "|";

/** A document written with `|` where the caret is. */
export function mount(marked: string): EditorView {
  const caret = marked.indexOf(CARET);
  const doc = marked.replace(CARET, "");
  const parent = document.body.appendChild(document.createElement("div"));
  const view = new EditorView({
    parent,
    state: EditorState.create({ doc, selection: EditorSelection.cursor(caret), extensions: EXTENSIONS }),
  });
  parsed(view);
  return view;
}

export function unmount(view: EditorView): void {
  view.destroy();
  view.dom.parentElement?.remove();
}

/** Every rule reads the syntax tree; one that has not reached the end of the
 *  document answers "plain text" for what lies beyond it. */
function parsed(view: EditorView): void {
  if (ensureSyntaxTree(view.state, view.state.doc.length, 5000) === null) {
    throw new Error("the markdown parse did not finish");
  }
}

export function marked(view: EditorView): string {
  const doc = view.state.doc.toString();
  const { main } = view.state.selection;
  if (!main.empty) return `${doc.slice(0, main.from)}[${doc.slice(main.from, main.to)}]${doc.slice(main.to)}`;
  return doc.slice(0, main.head) + CARET + doc.slice(main.head);
}

/** Press a key through the editor's bindings. False when no binding took it,
 *  which in a browser leaves the key to the page. */
export function press(view: EditorView, key: string, shiftKey = false): boolean {
  const handled = runScopeHandlers(view, new KeyboardEvent("keydown", { key, shiftKey }), "editor");
  parsed(view);
  return handled;
}

/** Type `text` one character at a time, through the typing rules. */
export function type(view: EditorView, text: string): void {
  for (const char of text) {
    const { from, to } = view.state.selection.main;
    const insert = () => view.state.update({ ...view.state.replaceSelection(char), userEvent: "input.type", scrollIntoView: true });
    const taken = view.state.facet(EditorView.inputHandler).some((handler) => handler(view, from, to, char, insert));
    if (!taken) view.dispatch(insert());
    parsed(view);
  }
}
