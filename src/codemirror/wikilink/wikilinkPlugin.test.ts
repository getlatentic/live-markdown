// @vitest-environment jsdom
import type { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "../core/editorTestHarness";
import { wikilinkPlugin } from "./wikilinkPlugin";

function atomic(view: EditorView): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  view.plugin(wikilinkPlugin)?.atomic.between(0, view.state.doc.length, (from, to) => {
    out.push([from, to]);
  });
  return out;
}

describe("wikilinkPlugin — [[target]] / [[target|alias]]", () => {
  afterEach(destroyEditors);

  it("hides [[ and ]] around a plain target, leaving the label visible", () => {
    const view = makeEditor("[[note]]", 0, [wikilinkPlugin]);
    const ranges = atomic(view);
    expect(ranges).toContainEqual([0, 2]); // "[["
    expect(ranges).toContainEqual([6, 8]); // "]]"
    expect(ranges).not.toContainEqual([2, 6]); // label "note" stays visible
  });

  it("hides the [[target| prefix and ]] for an aliased link", () => {
    const view = makeEditor("[[note|Alias]]", 0, [wikilinkPlugin]);
    const ranges = atomic(view);
    expect(ranges).toContainEqual([0, 7]); // "[[note|"
    expect(ranges).toContainEqual([12, 14]); // "]]"
  });

  it("ignores an empty target [[]]", () => {
    const view = makeEditor("[[]]", 0, [wikilinkPlugin]);
    expect(atomic(view)).toEqual([]);
  });
});
