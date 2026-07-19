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

  it("leaves [[…]] literal inside a fenced code block", () => {
    const view = makeEditor("```bash\nnpm i [[not-a-link]]\n```", 0, [wikilinkPlugin]);
    expect(atomic(view)).toEqual([]);
    expect(view.contentDOM.querySelector(".cm-wikilink")).toBeNull();
  });

  it("leaves [[…]] literal inside an inline code span", () => {
    const view = makeEditor("run `see [[note]] now` here", 0, [wikilinkPlugin]);
    expect(atomic(view)).toEqual([]);
  });

  it("stays literal when only the ]] closer sits in inline code", () => {
    // Export parity: a wikilink never spans a code boundary.
    const view = makeEditor("a [[x `y]] z` b", 0, [wikilinkPlugin]);
    expect(atomic(view)).toEqual([]);
  });

  it("still decorates a wikilink whose body contains a code span", () => {
    // A span strictly INSIDE the body protects nothing — the export converts
    // this link too; the guard must not be broader than the export rule.
    const doc = "[[a `b` c]]";
    const view = makeEditor(doc, 0, [wikilinkPlugin]);
    expect(atomic(view)).toContainEqual([0, 2]);
    expect(atomic(view)).toContainEqual([doc.length - 2, doc.length]);
  });
});
