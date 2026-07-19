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
  it("mounts a cursor layer; range painting is selectionLayer's job", () => {
    const view = makeView("- [ ] task line");
    expect(view.dom.querySelector(".cm-cursorLayer")).not.toBeNull();
    // drawnCaret alone carries no range layer — drawnSelection (its sibling
    // extension) owns that, and the editor shell wires both.
    expect(view.dom.querySelector(".cm-selectionLayer")).toBeNull();
  });

  it("survives selection changes without throwing (jsdom has no layout)", () => {
    const view = makeView("hello world");
    view.dispatch({ selection: { anchor: 2, head: 8 } });
    view.dispatch({ selection: { anchor: 5 } });
    expect(view.state.selection.main.head).toBe(5);
  });
});
