import { forceParsing, language, syntaxTree } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";

/** Work per slice. Small enough to never register as jank between frames. */
const SLICE_MS = 10;

/** Gap between slices, leaving the main thread mostly idle while the tail of a
 * large document parses. Markdown covers ~240k characters in ~43ms of work, so
 * even a very large note finishes within a few hundred ms of opening. */
const GAP_MS = 25;

/**
 * Drives the parse to the end of the document, establishing the invariant the
 * rest of the editor is written against: **the installed syntax tree covers
 * the whole document**, not just what the viewport happened to render.
 *
 * Without it, CodeMirror's own background work stops 100,000 characters past
 * the viewport (measured: the tree plateaus at 100,739 for a 167k-character
 * document and a 341k one alike, and never advances again). Everything
 * downstream of the tree is then silently wrong for the rest of the document:
 * table and mermaid widgets never materialize, code-language affordances never
 * appear, and structural commands are left to re-parse at the caret
 * ({@link treeAt} — still wanted, since a keystroke can land before this
 * finishes).
 *
 * Scheduled with `setTimeout`, not `requestIdleCallback`: WebKit stops
 * delivering idle callbacks to an unfocused window, and a note opened while
 * the app is in the background must still be parsed when the user comes back
 * to it.
 */
export const parseToEnd: Extension = ViewPlugin.fromClass(
  class {
    private timer: number | null = null;

    constructor(private readonly view: EditorView) {
      this.schedule();
    }

    update(update: ViewUpdate) {
      if (update.docChanged) this.schedule();
    }

    destroy() {
      if (this.timer !== null) window.clearTimeout(this.timer);
    }

    private schedule() {
      if (this.timer !== null) return;
      this.timer = window.setTimeout(this.work, GAP_MS);
    }

    private readonly work = () => {
      this.timer = null;
      const { state } = this.view;
      // Without a language nothing will ever parse; rescheduling would poll
      // forever for a tree that never comes.
      if (!state.facet(language)) return;
      if (syntaxTree(state).length >= state.doc.length) return;
      forceParsing(this.view, state.doc.length, SLICE_MS);
      // Reschedule until covered, not until progress: a slice can spend its
      // whole budget without committing a longer tree (measured: the resume
      // from CodeMirror's own stop point commits nothing on the first slice,
      // then covers the rest of the document on the next).
      this.schedule();
    };
  },
);
