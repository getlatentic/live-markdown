// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { cursorVisibleCharLeft } from "./cursorModel";
import { blockPrefixLength, visibleBackspace, visibleDeleteForward } from "./deleteNormalizer";
import { destroyEditors, makeEditor, text } from "./editorTestHarness";
import { armedTable, armedTableField } from "./tableArmed";
import { tableField } from "./tableField";

describe("delete — caret beyond a hidden marker never breaks the construct", () => {
  afterEach(destroyEditors);

  // `**Compose**` — e at 8, closing ** hidden at (9,11). Caret positions 9
  // (before the closing marker) and 11 (after it, where an end-of-line click
  // lands) render identically: "after the word". The invariant — backspace
  // deletes the visible char, never a marker — must hold from BOTH.

  it("backspace with the caret before the closing ** deletes just the char", () => {
    const view = makeEditor("**Compose**", 9);
    visibleBackspace(view);
    expect(text(view)).toBe("**Compos**");
  });

  it("backspace with the caret after the closing ** (EOL click) deletes just the char", () => {
    const view = makeEditor("**Compose**", 11);
    visibleBackspace(view);
    expect(text(view)).toBe("**Compos**");
  });

  it("backspace after arrow-left from the next line deletes just the char", () => {
    const doc = "**Compose**\nx";
    const view = makeEditor(doc, 12);
    cursorVisibleCharLeft(view);
    visibleBackspace(view);
    expect(text(view)).toBe("**Compos**\nx");
  });

  it("forward-delete with the caret at line start (before opening **) deletes just the char", () => {
    const view = makeEditor("**Compose**", 0);
    visibleDeleteForward(view);
    expect(text(view)).toBe("**ompose**");
  });

  it("backspacing the whole word from the outside edge still collapses the span", () => {
    const view = makeEditor("**C**", 5);
    visibleBackspace(view);
    expect(text(view)).toBe("");
  });

  it("backspace at the visible start of the first line is a no-op", () => {
    // Caret between the hidden opening ** and the C — visually the start of
    // the document. There is no visible char before it to delete.
    const view = makeEditor("**Compose**", 2);
    visibleBackspace(view);
    expect(text(view)).toBe("**Compose**");
  });

  it("deletes a whole emoji cluster, not half a surrogate pair", () => {
    const doc = "**a🎉**";
    const view = makeEditor(doc, doc.length);
    visibleBackspace(view);
    expect(text(view)).toBe("**a**");
  });
});

describe("blockPrefixLength", () => {
  it("measures list / heading / quote markers so a line-join keeps inline content", () => {
    expect(blockPrefixLength("- **B**: xyz")).toBe(2); // "- "
    expect(blockPrefixLength("* item")).toBe(2);
    expect(blockPrefixLength("+ item")).toBe(2);
    expect(blockPrefixLength("1. **B**")).toBe(3); // "1. "
    expect(blockPrefixLength("1) item")).toBe(3);
    expect(blockPrefixLength("## **H**")).toBe(3); // "## "
    expect(blockPrefixLength("> quote")).toBe(2);
    expect(blockPrefixLength("  - nested")).toBe(4); // indent + "- "
  });

  it("is zero when the line starts with inline content (no block prefix to skip)", () => {
    expect(blockPrefixLength("**B**: xyz")).toBe(0);
    expect(blockPrefixLength("plain text")).toBe(0);
    expect(blockPrefixLength("")).toBe(0);
  });
});

describe("visibleBackspace — line-join keeps inline markers", () => {
  afterEach(destroyEditors);

  it("backspacing in front of bold un-marks first, then joins — never eats the **", () => {
    const doc = "- **A**: xyz\n- **B**: xyz";
    const view = makeEditor(doc, doc.lastIndexOf("B"));
    visibleBackspace(view); // §8.2a: the bullet dies in place
    expect(text(view)).toBe("- **A**: xyz\n**B**: xyz");
    visibleBackspace(view); // now the join, inline markers intact
    expect(text(view)).toBe("- **A**: xyz**B**: xyz");
  });

  it("joins a bold paragraph line without eating its leading **", () => {
    const doc = "first line\n**B**: xyz";
    const view = makeEditor(doc, doc.indexOf("B"));
    visibleBackspace(view);
    expect(text(view)).toBe("first line**B**: xyz");
  });

  it("still deletes a single visible char mid-line (line-join branch not triggered)", () => {
    const view = makeEditor("hello", 3);
    visibleBackspace(view);
    expect(text(view)).toBe("helo");
  });
});

describe("visibleDeleteForward — forward line-join keeps inline markers", () => {
  afterEach(destroyEditors);

  it("Delete at the end of bold keeps both lines' ** markers", () => {
    const doc = "**A**\n**B**";
    const view = makeEditor(doc, doc.indexOf("\n")); // caret at end of line 1
    visibleDeleteForward(view);
    expect(text(view)).toBe("**A****B**"); // markers intact, just the newline gone
  });

  it("Delete at a bullet line's end joins the next item, dropping its bullet not its bold", () => {
    const doc = "- **A**: xyz\n- **B**: xyz";
    const view = makeEditor(doc, doc.indexOf("\n"));
    visibleDeleteForward(view);
    expect(text(view)).toBe("- **A**: xyz**B**: xyz");
  });

  it("still deletes a single visible char mid-line", () => {
    const view = makeEditor("hello", 0);
    visibleDeleteForward(view);
    expect(text(view)).toBe("ello");
  });
});

describe("delete-normalizer — empty styled span collapses entirely", () => {
  afterEach(destroyEditors);

  it("backspacing out the only char of **X** removes the whole construct", () => {
    const view = makeEditor("**X**", 3); // caret after X
    visibleBackspace(view);
    expect(text(view)).toBe("");
  });

  it("forward-deleting the only char of **X** removes the whole construct", () => {
    const view = makeEditor("**X**", 2); // caret before X
    visibleDeleteForward(view);
    expect(text(view)).toBe("");
  });
});

describe("delete-normalizer — two-step table delete (never edits hidden source)", () => {
  afterEach(destroyEditors);

  const DOC = "| A | B |\n| --- | --- |\n| 1 | 2 |\n\npara";
  const TABLE_END = DOC.indexOf("\n\npara");

  it("Backspace below a table parks + arms the table (first press, no edit)", () => {
    const view = makeEditor(DOC, DOC.indexOf("para"), [tableField, armedTableField]);
    visibleBackspace(view);
    expect(text(view)).toBe(DOC); // nothing deleted on the first press
    const sel = view.state.selection.main;
    expect(sel.empty).toBe(true);
    expect(sel.head).toBe(TABLE_END); // caret parked just past the table
    expect(armedTable(view.state)).toEqual({ from: 0, edge: "end" }); // and armed
  });

  it("a second Backspace (caret at the table's end) removes the table cleanly", () => {
    const view = makeEditor(DOC, DOC.indexOf("para"), [tableField, armedTableField]);
    visibleBackspace(view); // press 1: park + arm
    visibleBackspace(view); // press 2: delete
    expect(text(view)).toBe("\n\npara");
    expect(armedTable(view.state)).toBeNull(); // the edit disarmed
  });

  it("Delete above a table parks + arms its start edge (mirror of Backspace)", () => {
    const doc = "para\n\n| A | B |\n| --- | --- |\n| 1 | 2 |";
    const view = makeEditor(doc, "para".length, [tableField, armedTableField]); // caret at end of "para"
    visibleDeleteForward(view);
    expect(text(view)).toBe(doc);
    const sel = view.state.selection.main;
    expect(sel.empty).toBe(true);
    expect(sel.head).toBe(doc.indexOf("| A")); // caret parked just before the table
    expect(armedTable(view.state)).toEqual({ from: doc.indexOf("| A"), edge: "start" });
  });
});
