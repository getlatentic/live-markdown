// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { blockPrefixLength, visibleBackspace, visibleDeleteForward } from "./deleteNormalizer";
import { destroyEditors, makeEditor, text } from "./editorTestHarness";

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

  it("backspacing in front of bold joins the lines without eating the ** markers", () => {
    const doc = "- **A**: xyz\n- **B**: xyz";
    const view = makeEditor(doc, doc.lastIndexOf("B"));
    visibleBackspace(view);
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
