// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor, text } from "./editorTestHarness";
import { indentListItem, outdentListItem } from "./listIndent";

describe("list indent / outdent (Tab / Shift-Tab)", () => {
  afterEach(destroyEditors);

  it("nests an ordered item under its sibling, restarting the number at 1", () => {
    const view = makeEditor("1. first\n2. second", "1. first\n2. ".length);
    expect(indentListItem(view)).toBe(true);
    expect(text(view)).toBe("1. first\n   1. second");
  });

  it("nests a bullet under its sibling by the marker width (two columns)", () => {
    const view = makeEditor("- a\n- b", "- a\n- ".length);
    expect(indentListItem(view)).toBe(true);
    expect(text(view)).toBe("- a\n  - b");
  });

  it("consumes Tab but makes no change on the first item of a level", () => {
    const view = makeEditor("1. only", 3);
    expect(indentListItem(view)).toBe(true);
    expect(text(view)).toBe("1. only");
  });

  it("outdents a nested item back to its parent's level", () => {
    const view = makeEditor("- a\n  - b", "- a\n  - ".length);
    expect(outdentListItem(view)).toBe(true);
    expect(text(view)).toBe("- a\n- b");
  });

  it("consumes Shift-Tab but makes no change at the top level", () => {
    const view = makeEditor("- a\n- b", "- a\n- ".length);
    expect(outdentListItem(view)).toBe(true);
    expect(text(view)).toBe("- a\n- b");
  });

  it("falls through (returns false) when the caret isn't in a list", () => {
    const view = makeEditor("plain text", 3);
    expect(indentListItem(view)).toBe(false);
    expect(outdentListItem(view)).toBe(false);
  });

  it("carries the caret along with the item content across an indent", () => {
    const view = makeEditor("- a\n- bcd", "- a\n- b".length); // caret after 'b'
    indentListItem(view);
    expect(text(view)).toBe("- a\n  - bcd");
    expect(view.state.selection.main.head).toBe("- a\n  - b".length);
  });

  it("nests every list line of a multi-line selection", () => {
    const view = makeEditor("1. a\n2. b\n3. c", 0);
    view.dispatch({ selection: { anchor: "1. a\n".length, head: view.state.doc.length } });
    indentListItem(view);
    // b and c become a sublist under a; the plugin renumbers them on display.
    expect(text(view)).toBe("1. a\n   1. b\n   1. c");
  });
});
