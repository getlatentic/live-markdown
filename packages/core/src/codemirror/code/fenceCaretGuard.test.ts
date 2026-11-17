// @vitest-environment jsdom
/**
 * §12.9 — the caret never parks on a closed fence's marker rows.
 *
 * User report: the opener row accepted the caret, and the first keystroke
 * visibly jumped to the second line (the §12.7 re-site). Instead, clicks on
 * a marker row land on the nearest content edge and arrow motion crossing a
 * marker row exits the block, so typing always happens where the caret is.
 */
import { afterEach, describe, expect, it } from "vitest";
import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import { destroyEditors, makeEditor } from "../core/editorTestHarness";
import { fenceCaretGuard } from "./fenceCaretGuard";

function place(view: EditorView, pos: number, userEvent = "select"): number {
  view.dispatch({ selection: EditorSelection.cursor(pos), userEvent });
  return view.state.selection.main.head;
}

describe("caret placement on fence marker rows (§12.9)", () => {
  afterEach(destroyEditors);

  const doc = "alpha\n```js\ncode\nmore\n```\nomega";
  const openerStart = doc.indexOf("```js");
  const contentStart = doc.indexOf("code");
  const lastContentEnd = doc.indexOf("more") + "more".length;
  const closerStart = doc.indexOf("\n```\n") + 1;

  it("a click on the opener row enters the first content line", () => {
    const view = makeEditor(doc, 0, [fenceCaretGuard]);
    expect(place(view, openerStart + 2, "select.pointer")).toBe(contentStart);
  });

  it("a click on the closer row lands at the last content line's end", () => {
    const view = makeEditor(doc, 0, [fenceCaretGuard]);
    expect(place(view, closerStart + 1, "select.pointer")).toBe(lastContentEnd);
  });

  it("forward motion onto the opener continues into content", () => {
    const view = makeEditor(doc, "alpha".length, [fenceCaretGuard]);
    expect(place(view, openerStart + 1)).toBe(contentStart);
  });

  it("backward motion onto the opener exits above the block", () => {
    const view = makeEditor(doc, contentStart, [fenceCaretGuard]);
    expect(place(view, openerStart + 2)).toBe("alpha".length);
  });

  it("forward motion onto the closer exits below the block", () => {
    const view = makeEditor(doc, lastContentEnd, [fenceCaretGuard]);
    expect(place(view, closerStart + 1)).toBe(doc.indexOf("omega"));
  });

  it("at a document-ending block, forward motion holds at the content edge", () => {
    const endDoc = "```\ncode\n```";
    const view = makeEditor(endDoc, endDoc.indexOf("code") + 4, [fenceCaretGuard]);
    expect(place(view, endDoc.length - 1)).toBe(endDoc.indexOf("code") + 4);
  });

  it("an unclosed opener keeps accepting the caret (language flow)", () => {
    const view = makeEditor("```j\ntext below", 0, [fenceCaretGuard]);
    expect(place(view, 4, "select.pointer")).toBe(4);
  });

  it("a block with no content line is left alone", () => {
    const bare = "```\n```";
    const view = makeEditor(bare, 0, [fenceCaretGuard]);
    expect(place(view, 2, "select.pointer")).toBe(2);
  });

  it("range selections across the block are untouched", () => {
    const view = makeEditor(doc, 0, [fenceCaretGuard]);
    view.dispatch({
      selection: EditorSelection.range(0, closerStart + 2),
      userEvent: "select.pointer",
    });
    expect(view.state.selection.main.to).toBe(closerStart + 2);
  });
});

describe("no-content blocks are exempt — the language-typing state (§12.9/§12.4)", () => {
  afterEach(destroyEditors);

  it("arrowing within the opener row of an empty-body fence keeps the caret", () => {
    const doc = "```mermiad\n\n```";
    const openerEnd = doc.indexOf("\n");
    const view = makeEditor(doc, openerEnd, [fenceCaretGuard]);
    // A selection-only backward step (ArrowLeft toward the typo) must not be
    // re-sited off the row.
    expect(place(view, openerEnd - 1)).toBe(openerEnd - 1);
    expect(place(view, openerEnd - 4)).toBe(openerEnd - 4);
  });

  it("the exemption covers quote-prefixed blank bodies too", () => {
    const doc = "> ```js\n> \n> ```";
    const openerEnd = doc.indexOf("\n");
    const view = makeEditor(doc, openerEnd, [fenceCaretGuard]);
    expect(place(view, openerEnd - 1)).toBe(openerEnd - 1);
  });

  it("a fence WITH content still evicts the caret from its opener row", () => {
    const doc = "```js\ncode\n```";
    const view = makeEditor(doc, 0, [fenceCaretGuard]);
    const contentStart = doc.indexOf("code");
    expect(place(view, 2, "select.pointer")).toBe(contentStart);
  });
});

