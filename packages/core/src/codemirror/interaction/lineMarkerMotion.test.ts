// @vitest-environment jsdom
// Arrow Right from the end of a line lands after the next line's marker, never
// in front of it, and Arrow Left returns the same way.
import { afterEach, describe, expect, it } from "vitest";

import { caret, destroyEditors, makeEditor } from "../core/editorTestHarness";
import { cursorVisibleCharLeft, cursorVisibleCharRight, selectVisibleCharRight } from "./cursorModel";

describe("arrow keys across the start of a marked line", () => {
  afterEach(destroyEditors);

  it.each([
    ["a bullet", "one\n- two"],
    ["a number", "one\n\n12. two"],
    ["a task", "one\n- [ ] two"],
    ["a heading", "one\n## two"],
    ["a nested bullet", "- one\n  - two"],
    ["a quoted bullet", "> one\n> - two"],
    ["bold text", "one\n**two**"],
    ["plain text", "one\ntwo"],
  ])("Right never passes over the first letter of %s", (_name, doc) => {
    const text = doc.indexOf("two");
    const view = makeEditor(doc, doc.indexOf("one") + 3);
    const stops: number[] = [];
    while (caret(view) < text + 1) {
      cursorVisibleCharRight(view);
      stops.push(caret(view));
    }
    // The stop before the last is in front of the first letter, as drawn:
    // the text's start, or the far side of a marker hidden there.
    expect(stops[stops.length - 1]).toBe(text + 1);
    expect(doc.slice(stops[stops.length - 2], text).replace(/[*]/g, "")).toBe("");
  });

  it.each(["one\n- two", "one\n- [ ] two", "one\n## two"])("Right from the line above %j reaches the text itself, and Left returns", (doc) => {
    const view = makeEditor(doc, 3);
    cursorVisibleCharRight(view);
    expect(caret(view)).toBe(doc.indexOf("two"));
    cursorVisibleCharLeft(view);
    expect(caret(view)).toBe(3);
  });

  it("Shift+Right from the line above selects the line break and the marker", () => {
    const doc = "one\n- two";
    const view = makeEditor(doc, 3);
    selectVisibleCharRight(view);
    const { from, to } = view.state.selection.main;
    expect([from, to]).toEqual([3, doc.indexOf("two")]);
  });

  it("a marker in the middle of a line is still stepped over with its letter", () => {
    const doc = "a **b** c";
    const view = makeEditor(doc, 1);
    cursorVisibleCharRight(view);
    expect(caret(view)).toBe(2);
    cursorVisibleCharRight(view);
    expect(caret(view)).toBe(doc.indexOf("b") + 1);
  });
});
