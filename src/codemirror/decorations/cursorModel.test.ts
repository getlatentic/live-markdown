// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { cursorVisibleCharLeft, cursorVisibleCharRight } from "./cursorModel";
import { caret, destroyEditors, makeEditor } from "./editorTestHarness";

// `**b**` renders as a bold "b" with the `**` markers hidden. The caret must
// treat the markers as if they don't exist: one ArrowLeft/Right past the word
// in a single press, never stalling at a position inside the hidden `**`.
describe("cursorModel — caret motion skips hidden markdown markers", () => {
  afterEach(destroyEditors);
  const DOC = "a **b** c"; // visually "a b c"
  const boldStart = DOC.indexOf("**b**"); // 2
  const afterBold = boldStart + "**b**".length; // 7
  const bChar = DOC.indexOf("b"); // 4

  it("ArrowLeft from after the bold word lands before it in one step (not inside the **)", () => {
    const view = makeEditor(DOC, afterBold);
    cursorVisibleCharLeft(view);
    // Skips the hidden closing `**` (would naïvely stall at 6, inside it).
    expect(caret(view)).toBe(bChar);
  });

  it("ArrowRight from before the bold word lands after it in one step", () => {
    const view = makeEditor(DOC, boldStart);
    cursorVisibleCharRight(view);
    // Skips the hidden opening `**` (would naïvely stall at 3, inside it).
    expect(caret(view)).toBe(bChar + 1);
  });

  it("moves one character normally where there is no hidden marker", () => {
    const view = makeEditor(DOC, 0);
    cursorVisibleCharRight(view);
    expect(caret(view)).toBe(1);
  });
});
