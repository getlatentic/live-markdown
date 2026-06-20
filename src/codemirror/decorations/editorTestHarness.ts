/**
 * Test-only harness: a headless CodeMirror `EditorView` wired with the markdown
 * language + the live-preview decoration plugin, for keystroke-level tests of
 * the editor commands (cursor motion, delete, list continuation, formatting).
 *
 * CodeMirror runs under jsdom; each test FILE that uses this must declare
 * `// @vitest-environment jsdom` at its top. The Lezer tree is built eagerly so
 * the plugin's atomic/hidden ranges (which the commands consult) are present.
 *
 * Not shipped — nothing in the app imports it, so it tree-shakes out.
 */

import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { markdownDecorationsPlugin } from "./plugin";

const live: EditorView[] = [];

/** A headless editor over `doc` with the caret at `caret`. Extra extensions
 *  (e.g. a keymap under test) can be appended. Track-and-cleanup via
 *  {@link destroyEditors} in an `afterEach`. */
export function makeEditor(doc: string, caret = 0, extra: Extension[] = []): EditorView {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(caret),
    extensions: [markdown({ base: markdownLanguage }), markdownDecorationsPlugin, ...extra],
  });
  ensureSyntaxTree(state, doc.length, 5000);
  const view = new EditorView({ parent, state });
  live.push(view);
  return view;
}

/** Tear down every editor made since the last call. Call in `afterEach`. */
export function destroyEditors(): void {
  for (const view of live.splice(0)) {
    view.destroy();
    view.dom.parentElement?.remove();
  }
}

/** The current caret offset (head of the main selection). */
export function caret(view: EditorView): number {
  return view.state.selection.main.head;
}

/** The current document text. */
export function text(view: EditorView): string {
  return view.state.doc.toString();
}
