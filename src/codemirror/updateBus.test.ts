// @vitest-environment jsdom
import { EditorState, StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { onEditorUpdate, updateBus } from "./updateBus";

const views: EditorView[] = [];

function makeView(doc: string): EditorView {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: [updateBus] }),
    parent,
  });
  views.push(view);
  return view;
}

afterEach(() => {
  for (const view of views.splice(0)) {
    view.dom.parentElement?.remove();
    view.destroy();
  }
});

describe("updateBus", () => {
  it("delivers selection and doc updates to subscribers", () => {
    const view = makeView("hello");
    const seen: string[] = [];
    onEditorUpdate(view, (u) => {
      if (u.docChanged) seen.push("doc");
      else if (u.selectionSet) seen.push("sel");
    });
    view.dispatch({ selection: { anchor: 3 } });
    view.dispatch({ changes: { from: 0, insert: "x" } });
    expect(seen).toEqual(["sel", "doc"]);
  });

  it("survives a setState document swap (tab switch)", () => {
    // The regression this bus exists for: an updateListener injected with
    // StateEffect.appendConfig patches only the CURRENT state's config, so
    // the first setState (tab switch) silently kills it and the toolbar's
    // pressed states freeze.
    const view = makeView("first document");
    let busCalls = 0;
    let appendedCalls = 0;
    onEditorUpdate(view, (u) => {
      if (u.docChanged) busCalls++;
    });
    view.dispatch({
      effects: StateEffect.appendConfig.of(
        EditorView.updateListener.of((u) => {
          if (u.docChanged) appendedCalls++;
        }),
      ),
    });

    view.setState(EditorState.create({ doc: "second document", extensions: [updateBus] }));
    view.dispatch({ changes: { from: 0, insert: "x" } });

    expect(busCalls).toBe(1); // the bus subscription is alive after the swap
    expect(appendedCalls).toBe(0); // the appended listener died with the old state
  });

  it("unsubscribe stops delivery", () => {
    const view = makeView("hello");
    let calls = 0;
    const off = onEditorUpdate(view, () => {
      calls++;
    });
    view.dispatch({ selection: { anchor: 2 } });
    off();
    view.dispatch({ selection: { anchor: 4 } });
    expect(calls).toBe(1);
  });
});
