// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor, text } from "../core/editorTestHarness";
import { lineStructure } from "../core/lineStructure";
import { tightListContinuation } from "./listContinuation";

describe("listContinuation — Enter continues a tight list", () => {
  afterEach(destroyEditors);

  it("drops a new bullet tight under a non-empty bullet item", () => {
    const view = makeEditor("- first", 7); // caret at end of the item
    expect(tightListContinuation(view)).toBe(true);
    expect(text(view)).toBe("- first\n- ");
    expect(view.state.selection.main.head).toBe("- first\n- ".length);
  });

  it("increments the number for an ordered item", () => {
    const view = makeEditor("1. first", 8);
    expect(tightListContinuation(view)).toBe(true);
    expect(text(view)).toBe("1. first\n2. ");
  });

  it("preserves indentation for a nested bullet", () => {
    const view = makeEditor("  - deep", 8);
    expect(tightListContinuation(view)).toBe(true);
    expect(text(view)).toBe("  - deep\n  - ");
  });

  // Fall-through cases: the command declines (returns false) so the stock
  // markdown / default Enter handlers take over — no insertion of its own.
  it("declines on an empty item (so the stock handler can exit the list)", () => {
    const view = makeEditor("- ", 2);
    expect(tightListContinuation(view)).toBe(false);
    expect(text(view)).toBe("- ");
  });

  it("declines on a task item (the checkbox handler owns Enter)", () => {
    const view = makeEditor("- [ ] task", 10);
    expect(tightListContinuation(view)).toBe(false);
    expect(text(view)).toBe("- [ ] task");
  });

  it("declines mid-item (a split, not a continuation)", () => {
    const view = makeEditor("- first", 3); // caret inside "first"
    expect(tightListContinuation(view)).toBe(false);
    expect(text(view)).toBe("- first");
  });

  it("declines on a non-list line", () => {
    const view = makeEditor("plain text", 10);
    expect(tightListContinuation(view)).toBe(false);
    expect(text(view)).toBe("plain text");
  });
});

describe("tightListContinuation — task split at content start (#95)", () => {
  afterEach(destroyEditors);

  it("keeps an empty parseable checkbox above and moves the text down", () => {
    const doc = "- [ ] File & Folder";
    const view = makeEditor(doc, doc.indexOf("File"));
    expect(tightListContinuation(view)).toBe(true);
    // The remaining item keeps its trailing space — `- [ ]` without it parses
    // as a bullet with literal `[ ]` text and the checkbox markdown shows raw.
    expect(text(view)).toBe("- [ ] \n- [ ] File & Folder");
    expect(view.state.selection.main.head).toBe(text(view).indexOf("File"));
    const s = view.state;
    expect(lineStructure(s, s.doc.line(1)).list?.task).toBe(true);
    expect(lineStructure(s, s.doc.line(2)).list?.task).toBe(true);
  });

  it("a checked item keeps its state on the moved line; the empty box is unchecked", () => {
    const doc = "- [x] Done thing";
    const view = makeEditor(doc, doc.indexOf("Done"));
    expect(tightListContinuation(view)).toBe(true);
    expect(text(view)).toBe("- [ ] \n- [x] Done thing");
  });

  it("preserves nesting indentation", () => {
    const doc = "- a\n  - [ ] sub";
    const view = makeEditor(doc, doc.indexOf("sub"));
    expect(tightListContinuation(view)).toBe(true);
    expect(text(view)).toBe("- a\n  - [ ] \n  - [ ] sub");
  });

  it("declines inside a code fence", () => {
    const doc = "```\n- [ ] x\n```";
    const view = makeEditor(doc, doc.indexOf("x"));
    expect(tightListContinuation(view)).toBe(false);
    expect(text(view)).toBe(doc);
  });

  it("declines on an empty task item (stock handler exits the list)", () => {
    const view = makeEditor("- [ ] ", 6);
    expect(tightListContinuation(view)).toBe(false);
  });

  it("still declines mid-content (stock split is correct there)", () => {
    const doc = "- [ ] File";
    const view = makeEditor(doc, doc.indexOf("ile"));
    expect(tightListContinuation(view)).toBe(false);
  });
});
