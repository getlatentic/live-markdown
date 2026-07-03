// @vitest-environment jsdom
/**
 * interaction-spec §12.7 (TDD, red-first) — typing on a fence's CLOSING line
 * can never edit the fence: a closing fence with trailing text stops closing
 * (CommonMark allows no info string there), the block re-opens and swallows
 * everything below. The intent of typing on the block's last gray row is
 * "code at the end of the block" — so the keystroke lands on a fresh content
 * line before the closer.
 */
import { afterEach, describe, expect, it } from "vitest";
import { syntaxTree } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";

import { destroyEditors, makeEditor, text } from "./editorTestHarness";
import { fenceTypeAutoClose } from "./fenceAutoClose";

function typeChar(view: EditorView, ch: string): void {
  const head = view.state.selection.main.head;
  view.dispatch({
    changes: { from: head, insert: ch },
    selection: { anchor: head + ch.length },
    userEvent: "input.type",
  });
}

/** Number of FencedCode nodes and the end of the first one. */
function fenceShape(view: EditorView): { count: number; firstEnd: number } {
  let count = 0;
  let firstEnd = -1;
  syntaxTree(view.state).iterate({
    enter: (n) => {
      if (n.name === "FencedCode") {
        count += 1;
        if (firstEnd < 0) firstEnd = n.to;
      }
    },
  });
  return { count, firstEnd };
}

describe("typing on the closing fence line (§12.7)", () => {
  afterEach(destroyEditors);

  it("a char typed at the closer's end lands on a new last content line", () => {
    const doc = "```\ncode\n```\n\nCalibrate";
    const view = makeEditor(doc, doc.indexOf("\n\nCalibrate"), [fenceTypeAutoClose]);
    typeChar(view, "l");
    expect(text(view)).toBe("```\ncode\nl\n```\n\nCalibrate");
    // The block still closes where it should — nothing below is swallowed.
    const shape = fenceShape(view);
    expect(shape.count).toBe(1);
    expect(view.state.sliceDoc(shape.firstEnd)).toBe("\n\nCalibrate");
  });

  it("a char typed at the closer's start lands the same way", () => {
    const doc = "```\ncode\n```";
    const v = makeEditor(doc, doc.lastIndexOf("```"), [fenceTypeAutoClose]);
    typeChar(v, "x");
    expect(text(v)).toBe("```\ncode\nx\n```");
  });

  it("caret follows onto the new content line", () => {
    const doc = "```\ncode\n```";
    const view = makeEditor(doc, doc.length, [fenceTypeAutoClose]);
    typeChar(view, "z");
    const head = view.state.selection.main.head;
    expect(view.state.doc.lineAt(head).text).toBe("z");
    expect(head).toBe(view.state.doc.lineAt(head).to);
  });

  it("quote-nested closer keeps the quote prefix on the new line", () => {
    const doc = "> ```\n> code\n> ```";
    const view = makeEditor(doc, doc.length, [fenceTypeAutoClose]);
    typeChar(view, "q");
    expect(text(view)).toBe("> ```\n> code\n> q\n> ```");
  });

  it("typing on a closed opener row lands at the first content line (§12.7)", () => {
    const doc = "```\ncode\n```";
    const view = makeEditor(doc, 3, [fenceTypeAutoClose]);
    typeChar(view, "j");
    expect(text(view)).toBe("```\njcode\n```");
  });
});
