// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { EditorView } from "@codemirror/view";

import { destroyEditors, makeEditor, text } from "../core/editorTestHarness";
import { flankingGuard } from "./flankingGuard";

/** Emulate a keystroke inserting `ch` at the caret. */
function typeAt(view: EditorView, pos: number, ch: string): void {
  view.dispatch({
    changes: { from: pos, insert: ch },
    selection: { anchor: pos + ch.length },
    userEvent: "input.type",
  });
}

function editor(doc: string, caret: number): EditorView {
  return makeEditor(doc, caret, [flankingGuard]);
}

describe("flankingGuard — whitespace never dissolves emphasis (#94)", () => {
  afterEach(destroyEditors);

  it("space at a bold word's content end lands after the closing markers", () => {
    // Caret rests INSIDE the construct, before the hidden closing `**`.
    // `**Compose **` would stop parsing; the space belongs outside.
    const view = editor("**Compose**", 9);
    typeAt(view, 9, " ");
    expect(text(view)).toBe("**Compose** ");
    expect(view.state.selection.main.head).toBe(12);
  });

  it("space at a bold word's content start lands before the opening markers", () => {
    const view = editor("**Compose**", 2);
    typeAt(view, 2, " ");
    expect(text(view)).toBe(" **Compose**");
    expect(view.state.selection.main.head).toBe(1);
  });

  it("Enter at the content end lands after the closing markers too", () => {
    // A newline is whitespace to the flanking rule just like a space.
    const view = editor("**Compose**", 9);
    typeAt(view, 9, "\n");
    expect(text(view)).toBe("**Compose**\n");
  });

  it("space mid-word stays inside the construct", () => {
    const view = editor("**Compose**", 5);
    typeAt(view, 5, " ");
    expect(text(view)).toBe("**Com pose**");
  });

  it("italic and strikethrough get the same treatment", () => {
    const italic = editor("*it*", 3);
    typeAt(italic, 3, " ");
    expect(text(italic)).toBe("*it* ");

    const strike = editor("~~st~~", 4);
    typeAt(strike, 4, " ");
    expect(text(strike)).toBe("~~st~~ ");
  });

  it("hops outward through nested emphasis", () => {
    // `***x***` = Emphasis inside StrongEmphasis (or vice versa) — a space at
    // the shared content edge must clear BOTH constructs' markers.
    const view = editor("***x***", 4);
    typeAt(view, 4, " ");
    expect(text(view)).toBe("***x*** ");
  });

  it("inline code is exempt — edge spaces are meaningful there", () => {
    const view = editor("`code`", 5);
    typeAt(view, 5, " ");
    expect(text(view)).toBe("`code `");
  });

  it("non-whitespace typing at the boundary stays inside (extends the bold)", () => {
    const view = editor("**Compose**", 9);
    typeAt(view, 9, "r");
    expect(text(view)).toBe("**Composer**");
  });
});
