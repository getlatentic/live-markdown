// @vitest-environment jsdom
//
// jsdom has no layout, so these tests cover structure and state wiring: the
// layers mount, marker computation never throws with layout-free geometry,
// and the native-::selection override is present. Pixel-accurate rect
// assertions (incl. scroll-away-and-back) live in
// selectionLayer.browser.test.ts, which runs on real WebKit geometry.
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { drawnSelection } from "./selectionLayer";

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
    state: EditorState.create({ doc, extensions: [drawnSelection] }),
    parent,
  });
  views.push(view);
  return view;
}

describe("drawnSelection", () => {
  it("mounts the selection layer and the widget tint layer", () => {
    const view = makeView("hello world");
    expect(view.dom.querySelector(".cm-selectionLayer")).not.toBeNull();
    expect(view.dom.querySelector(".cm-selectionWidgetLayer")).not.toBeNull();
  });

  it("survives selection set, extension, and clearing without layout", () => {
    const view = makeView("alpha beta gamma\ndelta epsilon\nzeta");
    view.dispatch({ selection: { anchor: 0, head: 11 } });
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    view.dispatch({ selection: { anchor: 4 } });
    expect(view.state.selection.main.empty).toBe(true);
  });

  it("survives a full-document selection over a multi-line doc", () => {
    const lines = Array.from({ length: 200 }, (_, i) => `line ${i} with some words`).join("\n");
    const view = makeView(lines);
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    expect(view.state.selection.main.to).toBe(view.state.doc.length);
  });

  it("paints every range when multiple selections are enabled", () => {
    // Compose itself binds no multi-cursor gestures, but the layer loops all
    // ranges so a host that enables them gets painted secondaries for free.
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({
      state: EditorState.create({
        doc: "one two three four",
        extensions: [drawnSelection, EditorState.allowMultipleSelections.of(true)],
      }),
      parent,
    });
    views.push(view);
    view.dispatch({
      selection: EditorSelection.create(
        [EditorSelection.range(0, 3), EditorSelection.range(8, 13)],
        0,
      ),
    });
    expect(view.state.selection.ranges).toHaveLength(2);
  });

  it("makes the native ::selection transparent inside cm-content", () => {
    const view = makeView("styled");
    const styles = Array.from(view.dom.ownerDocument.querySelectorAll("style"))
      .map((s) => s.textContent ?? "")
      .join("\n");
    expect(styles).toContain("::selection");
    expect(styles).toMatch(/::selection[^}]*background-color:\s*transparent/);
    // The tablev2 cell editors keep their native paint.
    expect(styles).toContain('[contenteditable="plaintext-only"]');
  });
});
