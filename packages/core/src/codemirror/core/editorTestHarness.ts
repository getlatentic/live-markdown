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
import {
  mergeExtensions,
  footnoteExtension,
  highlightExtension,
  mathExtension,
  mermaidExtension,
  tableExtension,
  wikilinkExtension,
} from "../extensions";

const live: EditorView[] = [];

// The full rendering extension set the real editor composes — so a rendered-
// output test sees what the user sees (wikilinks, highlight, footnotes, math,
// tables), not just the base markdown decorations.
const FULL_EXTENSIONS = mergeExtensions([
  wikilinkExtension,
  highlightExtension,
  footnoteExtension,
  mathExtension,
  mermaidExtension,
  tableExtension(),
]).extensions;

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
  // The commands under test read the plugin's atomic/hidden ranges, which are
  // derived from the Lezer tree — so a tree that is not finished makes a guard
  // silently not fire, and the test fails as a confusing content diff rather
  // than as "the parse did not finish". `ensureSyntaxTree` reports that by
  // returning null; ignoring it is how a parse timeout became a mystery.
  if (ensureSyntaxTree(state, doc.length, 5000) === null) {
    throw new Error(
      `the markdown parse did not finish within 5s for a ${doc.length}-char document; ` +
        "any assertion after this would be testing an unparsed editor",
    );
  }
  const view = new EditorView({ parent, state });
  // Again, on the view's own state. Creating the view starts CodeMirror's
  // viewport-driven parse, and jsdom has no layout — so the viewport can be
  // tiny and `syntaxTree(view.state)` returns a tree that stops short of the
  // caret. A command asking "am I inside a fence?" then gets `null` and takes
  // the plain-text path, which is a wrong answer rather than a slow one.
  if (ensureSyntaxTree(view.state, doc.length, 5000) === null) {
    throw new Error(
      `the markdown parse did not finish within 5s for a ${doc.length}-char document; ` +
        "any assertion after this would be testing an unparsed editor",
    );
  }
  live.push(view);
  return view;
}

/** Like {@link makeEditor} but with every rendering extension the real editor
 *  loads — for tests that assert the user-visible rendered output, not just the
 *  source. */
export function makeFullEditor(doc: string, caret = 0, extra: Extension[] = []): EditorView {
  return makeEditor(doc, caret, [...FULL_EXTENSIONS, ...extra]);
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
