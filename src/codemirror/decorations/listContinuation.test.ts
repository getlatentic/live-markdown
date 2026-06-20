// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor, text } from "./editorTestHarness";
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
