// @vitest-environment jsdom
import type { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "./editorTestHarness";
import { mathPlugin } from "./mathPlugin";

function atomic(view: EditorView): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  view.plugin(mathPlugin)?.atomic.between(0, view.state.doc.length, (from, to) => {
    out.push([from, to]);
  });
  return out;
}

describe("mathPlugin", () => {
  afterEach(destroyEditors);

  it("replaces inline $…$ with an atomic widget over the whole span", () => {
    const doc = "a $x+1$ b";
    const view = makeEditor(doc, 0, [mathPlugin]);
    const start = doc.indexOf("$"); // 2
    const end = doc.lastIndexOf("$") + 1; // 7
    expect(atomic(view)).toContainEqual([start, end]);
  });

  it("replaces a $$…$$ block line atomically across the whole line", () => {
    const view = makeEditor("$$E=mc^2$$", 0, [mathPlugin]);
    expect(atomic(view)).toContainEqual([0, view.state.doc.length]);
  });

  it("leaves a bare $ (no closing delimiter) untouched", () => {
    const view = makeEditor("price is $5 today", 0, [mathPlugin]);
    expect(atomic(view)).toEqual([]);
  });
});
