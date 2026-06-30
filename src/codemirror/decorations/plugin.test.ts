// @vitest-environment jsdom
import type { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "./editorTestHarness";
import { markdownDecorationsPlugin } from "./plugin";

/** The plugin's atomic (= hidden) source ranges as [from, to] pairs. */
function atomicRanges(view: EditorView): Array<[number, number]> {
  const set = view.plugin(markdownDecorationsPlugin)?.atomic;
  const out: Array<[number, number]> = [];
  set?.between(0, view.state.doc.length, (from, to) => {
    out.push([from, to]);
  });
  return out;
}

describe("markdownDecorationsPlugin — hides + atomicizes syntax markers", () => {
  afterEach(destroyEditors);

  it("makes the bold ** markers atomic when the caret is outside the construct", () => {
    const doc = "x **b** y";
    const view = makeEditor(doc, 0); // caret far from the bold
    const ranges = atomicRanges(view);
    const open = doc.indexOf("**b**");
    expect(ranges).toContainEqual([open, open + 2]); // opening **
    expect(ranges).toContainEqual([doc.indexOf("b") + 1, doc.indexOf("b") + 3]); // closing **
    // The visible "b" itself is never atomic.
    const b = doc.indexOf("b");
    expect(ranges.some(([f, t]) => f <= b && b < t)).toBe(false);
  });

  it("hides the heading marker (and its space) when the caret is on another line", () => {
    const doc = "# Title\nbody";
    const view = makeEditor(doc, doc.indexOf("body"));
    expect(atomicRanges(view)).toContainEqual([0, 2]); // "# "
  });

  it("keeps the ** markers hidden/atomic even with the caret inside (hide-always)", () => {
    // EmphasisMark is `hide-always` in the registry: this editor never reveals
    // raw `**` for editing, so the cursor/delete normalizers can always treat
    // the markers as atomic regardless of caret position.
    const doc = "x **b** y";
    const view = makeEditor(doc, doc.indexOf("b")); // caret inside the bold
    const open = doc.indexOf("**b**");
    expect(atomicRanges(view)).toContainEqual([open, open + 2]);
  });

  it("renders an ordered-list mark as its number and a bullet mark as a •", () => {
    const ordered = makeEditor("1. first\n2. second", 0);
    const numbers = [...ordered.dom.querySelectorAll(".cm-ordered-marker")].map((e) => e.textContent);
    expect(numbers).toEqual(["1.", "2."]);

    const bullet = makeEditor("- item", 0);
    expect(bullet.dom.querySelector(".cm-bullet-widget")?.textContent).toBe("•");
    expect(bullet.dom.querySelector(".cm-ordered-marker")).toBeNull();
  });

  it("hides the leading backslash of an escape, keeping the escaped char (\\' → ')", () => {
    const doc = "year\\'s"; // a backslash-escaped apostrophe, as some models emit
    const view = makeEditor(doc, 0);
    const slash = doc.indexOf("\\"); // the "\" before the apostrophe
    expect(atomicRanges(view)).toContainEqual([slash, slash + 1]);
    // The escaped "'" itself stays visible (never atomic).
    const apos = doc.indexOf("'");
    expect(atomicRanges(view).some(([f, t]) => f <= apos && apos < t)).toBe(false);
  });
});
