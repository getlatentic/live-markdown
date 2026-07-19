// @vitest-environment jsdom
import type { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "../core/editorTestHarness";
import { footnotePlugin } from "./footnotePlugin";

function atomic(view: EditorView): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  view
    .plugin(footnotePlugin)
    ?.atomic.between(0, view.state.doc.length, (from, to) => {
      out.push([from, to]);
    });
  return out;
}

describe("footnotePlugin — [^id] references", () => {
  afterEach(destroyEditors);

  it("hides the [^ and ] brackets of a reference, leaving the label", () => {
    const doc = "see [^1] here";
    const view = makeEditor(doc, 0, [footnotePlugin]);
    const ref = doc.indexOf("[^1]"); // 4
    const ranges = atomic(view);
    expect(ranges).toContainEqual([ref, ref + 2]); // "[^"
    expect(ranges).toContainEqual([ref + 3, ref + 4]); // "]"
  });

  it("does not treat a definition line ([^1]: …) as a hidden reference", () => {
    const view = makeEditor("[^1]: the note", 0, [footnotePlugin]);
    expect(atomic(view)).toEqual([]);
  });

  it("leaves a [^ref] literal inside code (fenced block and inline span)", () => {
    expect(atomic(makeEditor("```\nsee [^1] here\n```", 0, [footnotePlugin]))).toEqual([]);
    expect(atomic(makeEditor("x `see [^1] here` y", 0, [footnotePlugin]))).toEqual([]);
  });

  it("does not style a definition-shaped line inside a fenced code block", () => {
    const view = makeEditor("```\n[^1]: the note\n```", 0, [footnotePlugin]);
    expect(view.contentDOM.querySelector(".cm-footnote-def")).toBeNull();
  });
});
