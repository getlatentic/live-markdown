// @vitest-environment jsdom
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
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

/** A raw view, deliberately not the harness: the harness pre-parses to the end
 *  of the document, which is the invariant this extension exists to establish. */
function openEditor(doc: string, extra: Extension[]): EditorView {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [markdown({ base: markdownLanguage }), ...extra],
    }),
  });
  views.push(view);
  return view;
}

/** Long enough that the opening frame's parse stops well short of the end. */
function longDoc(): string {
  return Array.from({ length: 800 }, (_, i) => `paragraph line ${i}`).join("\n\n");
}

async function waitFor(check: () => boolean, ms: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return check();
}

describe("parseToEnd", () => {
  it("drives the installed tree to the end of the document", async () => {
    const doc = longDoc();
    const view = openEditor(doc, [parseToEnd]);
    expect(syntaxTree(view.state).length).toBeLessThan(doc.length); // the premise
    const covered = await waitFor(() => syntaxTree(view.state).length >= doc.length, 5_000);
    expect(covered).toBe(true);
  }, 15_000);

  it("re-arms on a document change", async () => {
    const view = openEditor(longDoc(), [parseToEnd]);
    await waitFor(() => syntaxTree(view.state).length >= view.state.doc.length, 5_000);

    view.dispatch({
      changes: { from: view.state.doc.length, insert: `\n\n${longDoc()}` },
    });
    const covered = await waitFor(
      () => syntaxTree(view.state).length >= view.state.doc.length,
      5_000,
    );
    expect(covered).toBe(true);
  }, 15_000);

  it("does not poll a view that has no language", async () => {
    const view = openEditor(longDoc(), []);
    const bare = new EditorView({
      parent: view.dom.parentElement!,
      state: EditorState.create({ doc: "plain text", extensions: [parseToEnd] }),
    });
    views.push(bare);
    // One gap is enough for the first work() call to run and decline.
    await new Promise((r) => setTimeout(r, 200));
    expect(syntaxTree(bare.state).length).toBe(0);
  });
});
