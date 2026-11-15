/**
 * Drives the editor's own key bindings and typing rules from a test: the same
 * extension list the editor component loads, with keys delivered the way
 * CodeMirror delivers them.
 */

import { ensureSyntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, runScopeHandlers } from "@codemirror/view";

import { markdownPaste } from "../clipboard/pasteMarkdown";
import { markdownDecorationsPlugin } from "../core";
import { editingStack } from "../editingStack";
import { mergeExtensions, tableExtension } from "../extensions";

const EXTENSIONS = [...editingStack, markdownDecorationsPlugin, markdownPaste, ...mergeExtensions([tableExtension()]).extensions];

/** Not `|`, which a table is written with. */
export const CARET = "‸";
export const SELECTED = ["«", "»"] as const;

/** Where the marks stand in a marked document, and the document without them. */
function unmarked(marked: string): { doc: string; selection: EditorSelection } {
  const [open, close] = SELECTED;
  const from = marked.indexOf(open);
  if (from < 0) return { doc: marked.replace(CARET, ""), selection: EditorSelection.single(marked.indexOf(CARET)) };
  const to = marked.indexOf(close) - open.length;
  return { doc: marked.replace(open, "").replace(close, ""), selection: EditorSelection.single(from, to) };
}

/** A document written with `‸` where the caret is, or `«…»` around the
 *  selected text. */
export function mount(marked: string): EditorView {
  const { doc, selection } = unmarked(marked);
  const parent = document.body.appendChild(document.createElement("div"));
  const view = new EditorView({
    parent,
    state: EditorState.create({ doc, selection, extensions: EXTENSIONS }),
  });
  parsed(view);
  return view;
}

export function unmount(view: EditorView): void {
  const parent = view.dom.parentElement;
  view.destroy();
  parent?.remove();
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
  if (!main.empty) return `${doc.slice(0, main.from)}${SELECTED[0]}${doc.slice(main.from, main.to)}${SELECTED[1]}${doc.slice(main.to)}`;
  return doc.slice(0, main.head) + CARET + doc.slice(main.head);
}

/** A key and what is held with it. `mod` is ⌘ on a Mac and Ctrl elsewhere;
 *  `word` is the key that makes a deletion take a word: ⌥ on a Mac, Ctrl
 *  elsewhere. `line` makes it take the line: ⌘ on a Mac, and no key
 *  elsewhere. */
export interface Chord {
  key: string;
  shift?: boolean;
  mod?: boolean;
  word?: boolean;
  line?: boolean;
}

export const MAC = /Mac/.test(navigator.platform);

/** The modifier keys a chord holds down, by their DOM names. */
export function held({ shift, mod, word, line }: Chord): { shiftKey: boolean; altKey: boolean; metaKey: boolean; ctrlKey: boolean } {
  return {
    shiftKey: Boolean(shift),
    altKey: Boolean(word) && MAC,
    metaKey: (Boolean(mod) || Boolean(line)) && MAC,
    ctrlKey: (Boolean(mod) || Boolean(word)) && !MAC,
  };
}

/** Press a key through the editor's bindings. False when no binding took it,
 *  which in a browser leaves the key to the page. */
export function press(view: EditorView, key: string | Chord): boolean {
  const chord = typeof key === "string" ? { key } : key;
  const handled = runScopeHandlers(view, new KeyboardEvent("keydown", { key: chord.key, ...held(chord) }), "editor");
  parsed(view);
  return handled;
}

/** What a paste carries: plain text, and HTML when it comes from a page or
 *  a word processor. */
export interface Pasted {
  text: string;
  html?: string;
}

/** Paste: a paste event that carries the text. The system clipboard is not
 *  read or written. */
export function paste(view: EditorView, { text, html = "" }: Pasted): void {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  const kinds: Record<string, string> = { "text/plain": text, "text/html": html };
  const clipboardData = { getData: (type: string) => kinds[type] ?? "", files: [], items: [], types: Object.keys(kinds).filter((type) => kinds[type]) };
  Object.defineProperty(event, "clipboardData", { value: clipboardData });
  view.contentDOM.dispatchEvent(event);
  parsed(view);
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
