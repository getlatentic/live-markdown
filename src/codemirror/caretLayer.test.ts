// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { drawnCaret } from "./caretLayer";

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.dom.parentElement?.remove();
    view.destroy();
  }
});

function makeView(doc: string): EditorView {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: [drawnCaret] }),
    parent,
  });
  views.push(view);
  return view;
}

describe("drawnCaret", () => {
  it("mounts a cursor layer and NO drawn selection layer", () => {
    const view = makeView("- [ ] task line");
    expect(view.dom.querySelector(".cm-cursorLayer")).not.toBeNull();
    // Range painting is the engine's native ::selection — no drawn layer,
    // so drawSelection's wrapped-line probe bug (#90) is out of the picture.
    expect(view.dom.querySelector(".cm-selectionLayer")).toBeNull();
  });

  it("survives selection changes without throwing (jsdom has no layout)", () => {
    const view = makeView("hello world");
    view.dispatch({ selection: { anchor: 2, head: 8 } });
    view.dispatch({ selection: { anchor: 5 } });
    expect(view.state.selection.main.head).toBe(5);
  });
});
