/**
 * The editor invariant, proven in the engine we ship on: with {@link parseToEnd}
 * installed, the syntax tree covers the whole document shortly after opening —
 * including documents past the ~100k point where CodeMirror's own background
 * parse stops for good.
 */

import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { parseToEnd } from "./parseToEnd";

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
    view.dom.parentElement?.remove();
  }
});

function openEditor(doc: string, extra: Extension[]): EditorView {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(0),
      extensions: [markdown({ base: markdownLanguage }), ...extra],
    }),
  });
  views.push(view);
  return view;
}

/** Big enough that the tail sits past the background parse's permanent stop. */
function hugeDoc(): string {
  const filler = Array.from({ length: 8000 }, (_, i) => `paragraph line ${i}`).join("\n\n");
  return `${filler}\n\n\`\`\`\ncode\n\`\`\``;
}

async function waitFor(check: () => boolean, ms: number): Promise<boolean> {
  const start = performance.now();
  while (performance.now() - start < ms) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return check();
}

describe("parseToEnd", () => {
  it("covers a document the background parse alone never finishes", async () => {
    const doc = hugeDoc();
    const view = openEditor(doc, [parseToEnd]);
    const covered = await waitFor(() => syntaxTree(view.state).length >= doc.length, 10_000);
    expect(covered).toBe(true);
  }, 30_000);

  it("re-covers after an edit", async () => {
    const doc = hugeDoc();
    const view = openEditor(doc, [parseToEnd]);
    await waitFor(() => syntaxTree(view.state).length >= doc.length, 10_000);

    view.dispatch({ changes: { from: 0, insert: "# heading\n\n" } });
    const covered = await waitFor(
      () => syntaxTree(view.state).length >= view.state.doc.length,
      10_000,
    );
    expect(covered).toBe(true);
  }, 30_000);

  it("control: without it, the background parse stops short — the premise", async () => {
    // If this ever fails, CodeMirror now covers large documents on its own and
    // the extension is obsolete — remove it rather than keep a no-op.
    const doc = hugeDoc();
    const view = openEditor(doc, []);
    const covered = await waitFor(() => syntaxTree(view.state).length >= doc.length, 4_000);
    expect(covered).toBe(false);
  }, 30_000);
});
