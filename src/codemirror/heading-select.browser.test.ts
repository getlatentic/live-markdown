/**
 * What a selection over a heading's visible text costs the heading.
 *
 * The `# ` is hidden, so a reader selecting "what I can see" has no way to know
 * whether the marker came with it. Which gesture they used decides.
 */
import { EditorSelection } from "@codemirror/state";
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeFullEditor } from "./core/editorTestHarness";

describe("@browser typing over a selected heading", () => {
  afterEach(destroyEditors);

  it("replaces the word and keeps the heading, when the word is what was selected", () => {
    const view = makeFullEditor("# Untitled\n\nbody\n", 2);
    view.focus();
    // A double-click on the word — the gesture that selects visible text.
    view.dispatch({ selection: EditorSelection.range(2, 10) });
    view.dispatch(view.state.replaceSelection("Hello"));
    expect(view.state.doc.toString()).toBe("# Hello\n\nbody\n");
  });

  // Selecting the LINE is a different gesture, and it does take the marker with
  // it: a drag from the left margin, or select-all, resolves to the line start
  // — which is before the hidden `# `. The heading becomes a paragraph.
  //
  // Pinned as the current behaviour, not endorsed as the right one: the reader
  // cannot see the marker they just destroyed. `EditorView.atomicRanges` already
  // carries [0, 2] for it, so cursor motion steps over it; a selection's edges
  // are simply not snapped the same way.
  it("takes the marker with it when the whole line was selected", () => {
    const view = makeFullEditor("# Untitled\n\nbody\n", 0);
    view.focus();
    view.dispatch({ selection: EditorSelection.range(0, 10) });
    view.dispatch(view.state.replaceSelection("Hello"));
    expect(view.state.doc.toString()).toBe("Hello\n\nbody\n");
  });
});
