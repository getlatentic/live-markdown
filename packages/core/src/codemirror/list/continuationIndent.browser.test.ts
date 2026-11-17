/**
 * @browser: where a list item's continuation line draws. Whether its text
 * stands under the item's text is a matter of drawn widths, knowable only in
 * a browser with the editor laid out.
 */

import type { EditorView } from "@codemirror/view";
import { userEvent } from "@vitest/browser/context";
import { afterEach, describe, expect, it } from "vitest";

import { editorBaseTheme } from "../core";
import { destroyEditors, makeFullEditor } from "../core/editorTestHarness";
import { editingStack } from "../editingStack";

afterEach(destroyEditors);

function mount(doc: string, caret = doc.length): EditorView {
  const view = makeFullEditor(doc, caret, [editorBaseTheme, ...editingStack]);
  document.body.appendChild(view.dom);
  view.focus();
  return view;
}

/** The left edge of `word` as drawn, in pixels. */
function leftOf(view: EditorView, word: string): number {
  const at = view.state.doc.toString().indexOf(word);
  const edge = view.coordsAtPos(at, 1);
  if (!edge) throw new Error(`${word} is not drawn`);
  return edge.left;
}

describe("a line continuing a list item", () => {
  it.each([
    ["a bullet", "- one\n  more"],
    ["a number", "1. one\n   more"],
    ["a two-digit number", "9. nine\n10. one\n    more"],
    ["a nested bullet", "- outer\n  - one\n    more"],
    ["a bullet, as a paragraph of its own", "- one\n\n  more"],
  ])("draws under the text of %s", (_name, doc) => {
    const view = mount(doc);
    expect(leftOf(view, "more")).toBeCloseTo(leftOf(view, "one"), 1);
  });

  it("is drawn as written when indented less than the item's text", () => {
    const view = mount("1. one\n more");
    expect(leftOf(view, "more")).toBeLessThan(leftOf(view, "one"));
  });

  it("keeps deeper indentation beyond the item's text", () => {
    const view = mount("- one\n    more");
    expect(leftOf(view, "more")).toBeGreaterThan(leftOf(view, "one"));
  });

  it("draws a task's continuation under its checkbox", () => {
    const view = mount("- [ ] one\n  more");
    expect(leftOf(view, "more")).toBeLessThan(leftOf(view, "one"));
  });
});

describe("Backspace at the start of a list item", () => {
  it("leaves the text where it stood, then moves it to the margin, then joins", async () => {
    const doc = "- one\n- two";
    const view = mount(doc, doc.indexOf("two"));
    const stood = leftOf(view, "two");

    await userEvent.keyboard("{Backspace}");
    expect(view.state.doc.toString()).toBe("- one\n  two");
    expect(leftOf(view, "two")).toBeCloseTo(stood, 1);

    await userEvent.keyboard("{Backspace}");
    expect(view.state.doc.toString()).toBe("- one\ntwo");
    expect(leftOf(view, "two")).toBeLessThan(stood);

    await userEvent.keyboard("{Backspace}");
    expect(view.state.doc.toString()).toBe("- onetwo");
  });

  it("steps over the kept indentation as one with the arrow keys", async () => {
    const doc = "- one\n  two";
    const view = mount(doc, doc.indexOf("two"));
    await userEvent.keyboard("{ArrowLeft}");
    expect(view.state.selection.main.head).toBe("- one".length);
    await userEvent.keyboard("{ArrowRight}");
    expect(view.state.selection.main.head).toBe(doc.indexOf("two"));
  });
});
