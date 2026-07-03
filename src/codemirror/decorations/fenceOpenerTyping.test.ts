// @vitest-environment jsdom
/**
 * §12.7 extension + §12.8 (TDD, red-first).
 *
 * Opener row: users keep clicking a block's first gray row to type CODE —
 * three separate reports. On a CLOSED fence, characters typed on the opener
 * line land on the first content line instead of silently extending the
 * (differently-styled) language tag. The pill still renders existing tags;
 * editing one moves to RAW mode.
 *
 * Tab: inside a code block, Tab must indent (and Shift-Tab dedent) — with no
 * binding, the browser's focus navigation stole the key and the caret
 * "jumped out of the editor to the rich/raw button".
 */
import { afterEach, describe, expect, it } from "vitest";
import type { EditorView } from "@codemirror/view";

import { destroyEditors, makeEditor, text } from "./editorTestHarness";
import { fenceTypeAutoClose } from "./fenceAutoClose";
import { fenceTabIndent, fenceTabDedent } from "./fenceTabIndent";

function typeChar(view: EditorView, ch: string): void {
  const head = view.state.selection.main.head;
  view.dispatch({
    changes: { from: head, insert: ch },
    selection: { anchor: head + ch.length },
    userEvent: "input.type",
  });
}

describe("typing on a closed fence's opener row (§12.7)", () => {
  afterEach(destroyEditors);

  it("a char at the opener's end lands at the start of the first content line", () => {
    const doc = "```js\ncode\n```";
    const view = makeEditor(doc, "```js".length, [fenceTypeAutoClose]);
    typeChar(view, "x");
    expect(text(view)).toBe("```js\nxcode\n```");
    const head = view.state.selection.main.head;
    expect(head).toBe("```js\nx".length);
  });

  it("an unclosed opener still accepts language typing (paste flow)", () => {
    const doc = "```j\ncode below";
    const view = makeEditor(doc, "```j".length, [fenceTypeAutoClose]);
    typeChar(view, "s");
    expect(text(view)).toBe("```js\ncode below");
  });
});

describe("Tab inside a code block indents (§12.8)", () => {
  afterEach(destroyEditors);

  it("Tab inserts an indent unit at the caret", () => {
    const doc = "```\ncode\n```";
    const view = makeEditor(doc, doc.indexOf("code"));
    expect(fenceTabIndent(view)).toBe(true);
    expect(text(view)).toBe("```\n  code\n```");
  });

  it("Shift-Tab removes leading indent from the line", () => {
    const doc = "```\n  code\n```";
    const view = makeEditor(doc, doc.indexOf("code") + 2);
    expect(fenceTabDedent(view)).toBe(true);
    expect(text(view)).toBe("```\ncode\n```");
  });

  it("outside code, both decline so lists and focus keep their behavior", () => {
    const doc = "plain text";
    const view = makeEditor(doc, 2);
    expect(fenceTabIndent(view)).toBe(false);
    expect(fenceTabDedent(view)).toBe(false);
  });
});
