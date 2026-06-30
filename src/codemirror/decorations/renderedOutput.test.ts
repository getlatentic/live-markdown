// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeFullEditor } from "./editorTestHarness";

/**
 * What the USER SEES — the rendered output, not the markdown source.
 *
 * The block-command / source-level tests assert what's written to the document;
 * this suite asserts what's drawn for it, through the *full* editor extension
 * set (wikilinks, highlight, footnotes, math, tables — not just the base
 * decorations). That layer was previously untested, which is how a numbered
 * list rendering as bullets and a task item drawing both a bullet and a checkbox
 * shipped unnoticed.
 */

/** The visible text of each rendered line (hidden markers gone, widgets in). */
function seen(doc: string): string[] {
  const view = makeFullEditor(doc, 0);
  return [...view.contentDOM.querySelectorAll(".cm-line")].map((line) => line.textContent ?? "");
}

describe("rendered output — what the user sees", () => {
  afterEach(destroyEditors);

  it("hides heading / emphasis / code markers, leaving the content", () => {
    expect(seen("# Title")).toEqual(["Title"]);
    expect(seen("**b** *i* `c`")).toEqual(["b i c"]);
  });

  it("draws a bullet as • and an ordered item as its number — never a bullet", () => {
    expect(seen("- item")).toEqual(["•item"]);
    expect(seen("1. first\n2. second")).toEqual(["1.first", "2.second"]);
    // The regression behind #22: an ordered mark must not render as a bullet.
    expect(seen("3. lonely")).toEqual(["3.lonely"]);
  });

  it("renumbers an ordered list on display (CommonMark), ignoring source digits", () => {
    expect(seen("1. a\n1. b\n1. c")).toEqual(["1.a", "2.b", "3.c"]);
    // Starts at the first item's number, then sequential.
    expect(seen("3. a\n9. b")).toEqual(["3.a", "4.b"]);
  });

  it("re-numbers live when an item is removed", () => {
    const view = makeFullEditor("1. a\n1. b\n1. c", 0);
    const numbers = () =>
      [...view.contentDOM.querySelectorAll(".cm-ordered-marker")].map((e) => e.textContent);
    expect(numbers()).toEqual(["1.", "2.", "3."]);
    view.dispatch({ changes: { from: 0, to: 5, insert: "" } }); // remove the first item
    expect(numbers()).toEqual(["1.", "2."]);
  });

  it("keeps the number marker rendered while typing into an item", () => {
    // The contract behind #37: editing an item's text must not drop its marker
    // back to raw `1.` source. (The shipped flicker was an incomplete-parse race
    // the editor now guards against by force-parsing the viewport.)
    const view = makeFullEditor("1. a\n2. b", 0);
    const numbers = () =>
      [...view.contentDOM.querySelectorAll(".cm-ordered-marker")].map((e) => e.textContent);
    expect(numbers()).toEqual(["1.", "2."]);
    view.dispatch({ changes: { from: view.state.doc.length, insert: "more" } });
    expect(numbers()).toEqual(["1.", "2."]);
  });

  it("renders a nested ordered sublist starting at 1", () => {
    // The result of indenting two items under a parent (#40): the sublist is a
    // separate ordered list, so it renumbers from 1 by position.
    const view = makeFullEditor("1. parent\n   1. child\n   1. second", 0);
    const numbers = [...view.contentDOM.querySelectorAll(".cm-ordered-marker")].map(
      (e) => e.textContent,
    );
    expect(numbers).toEqual(["1.", "1.", "2."]);
  });

  it("draws a task item as a checkbox, with no bullet beside it", () => {
    const content = makeFullEditor("- [ ] todo", 0).contentDOM;
    expect(content.querySelector(".cm-task-checkbox")).not.toBeNull();
    expect(content.querySelector(".cm-bullet-widget")).toBeNull();
  });

  it("hides wikilink brackets, showing the name (or the alias)", () => {
    expect(seen("[[Note Name]]")).toEqual(["Note Name"]);
    expect(seen("[[target|Alias]]")).toEqual(["Alias"]);
  });

  it("hides markdown-link and highlight markers, leaving the visible text", () => {
    expect(seen("[text](http://example.com)")).toEqual(["text"]);
    expect(seen("==marked==")).toEqual(["marked"]);
  });

  it("tags a blockquote line so it can be styled", () => {
    const line = makeFullEditor("> quoted", 0).contentDOM.querySelector(".cm-line");
    expect(line?.className).toContain("cm-blockquote");
  });
});
