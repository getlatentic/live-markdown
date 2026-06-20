// @vitest-environment jsdom
import type { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "./editorTestHarness";
import { highlightPlugin } from "./highlightPlugin";

function atomic(view: EditorView): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  view
    .plugin(highlightPlugin)
    ?.atomic.between(0, view.state.doc.length, (from, to) => {
      out.push([from, to]);
    });
  return out;
}

describe("highlightPlugin — ==text== highlight", () => {
  afterEach(destroyEditors);

  it("hides the == markers (atomic) around the highlighted text", () => {
    const view = makeEditor("==hi==", 0, [highlightPlugin]);
    const ranges = atomic(view);
    expect(ranges).toContainEqual([0, 2]); // opening ==
    expect(ranges).toContainEqual([4, 6]); // closing ==
  });

  it("does nothing for plain text with no == markers", () => {
    const view = makeEditor("plain text", 0, [highlightPlugin]);
    expect(atomic(view)).toEqual([]);
  });
});
