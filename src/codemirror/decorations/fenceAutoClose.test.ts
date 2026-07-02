// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor, text } from "./editorTestHarness";
import type { EditorView } from "@codemirror/view";

import { fenceAutoClose, fenceExitBlock, fenceTypeAutoClose } from "./fenceAutoClose";

describe("fenceAutoClose — Enter on a just-typed fence (#91)", () => {
  afterEach(destroyEditors);

  it("closes the fence and puts the caret inside the empty block", () => {
    const view = makeEditor("```", 3);
    expect(fenceAutoClose(view)).toBe(true);
    expect(text(view)).toBe("```\n\n```");
    expect(view.state.selection.main.head).toBe(4);
  });

  it("keeps the language info and matches the fence length", () => {
    const js = makeEditor("```js", 5);
    expect(fenceAutoClose(js)).toBe(true);
    expect(text(js)).toBe("```js\n\n```");

    const long = makeEditor("````", 4);
    expect(fenceAutoClose(long)).toBe(true);
    expect(text(long)).toBe("````\n\n````");
  });

  it("releases content below instead of swallowing it", () => {
    // The user's report: an unclosed fence runs to the end of the document,
    // so everything below turned into code. Closing right after the opening
    // line hands it back to prose.
    const view = makeEditor("```\nexisting text below", 3);
    expect(fenceAutoClose(view)).toBe(true);
    expect(text(view)).toBe("```\n\n```\nexisting text below");
    expect(view.state.selection.main.head).toBe(4);
  });

  it("declines on an already-closed fence's opening line", () => {
    const view = makeEditor("```\ncode\n```", 3);
    expect(fenceAutoClose(view)).toBe(false);
    expect(text(view)).toBe("```\ncode\n```");
  });

  it("declines mid-line and on non-fence lines", () => {
    const mid = makeEditor("```js", 3);
    expect(fenceAutoClose(mid)).toBe(false);

    const prose = makeEditor("plain", 5);
    expect(fenceAutoClose(prose)).toBe(false);
  });

  it("steps onto an empty first content line instead of inserting another (§12.5)", () => {
    const doc = "```\n\n```";
    const view = makeEditor(doc, 3, [fenceTypeAutoClose]);
    expect(fenceAutoClose(view)).toBe(true);
    expect(text(view)).toBe(doc); // no edit — just the caret move
    expect(view.state.selection.main.head).toBe("```\n".length);
  });

  it("declines inside the code content of an unclosed fence", () => {
    // Enter while typing code must stay a plain newline — only the opening
    // line auto-closes.
    const doc = "```\nlet x = 1";
    const view = makeEditor(doc, doc.length);
    expect(fenceAutoClose(view)).toBe(false);
  });
});

describe("fenceTypeAutoClose — the completing keystroke closes the fence (§9.5)", () => {
  afterEach(destroyEditors);

  function typeChar(view: EditorView, ch: string): void {
    const head = view.state.selection.main.head;
    view.dispatch({
      changes: { from: head, insert: ch },
      selection: { anchor: head + 1 },
      userEvent: "input.type",
    });
  }

  it("typing the third backtick closes the fence with the caret on a fresh content line (§12.4)", () => {
    const view = makeEditor("``", 2, [fenceTypeAutoClose]);
    typeChar(view, "`");
    expect(text(view)).toBe("```\n\n```");
    expect(view.state.selection.main.head).toBe("```\n".length);
  });

  it("content below is never hijacked, not even transiently", () => {
    const doc = "``\nexisting text";
    const view = makeEditor(doc, 2, [fenceTypeAutoClose]);
    typeChar(view, "`");
    expect(text(view)).toBe("```\n\n```\nexisting text");
  });

  it("typing after the close lands as visible code, not an invisible info string", () => {
    const view = makeEditor("``", 2, [fenceTypeAutoClose]);
    typeChar(view, "`");
    typeChar(view, "j");
    typeChar(view, "s");
    expect(text(view)).toBe("```\njs\n```");
  });

  it("a language typed before the third backtick is kept on the opener", () => {
    // ``js| → caret before the js? No — the flow is ``` then edit; the
    // supported language flow is typing the info on the opener line later or
    // before completing the fence: `` + ` typed with js already present is
    // NOT a bare fence line, so no auto-close fires and typing continues.
    const view = makeEditor("``js", 2, [fenceTypeAutoClose]);
    typeChar(view, "`");
    expect(text(view)).toBe("```js");
  });

  it("tilde fences close the same way", () => {
    const view = makeEditor("~~", 2, [fenceTypeAutoClose]);
    typeChar(view, "~");
    expect(text(view)).toBe("~~~\n\n~~~");
  });

  it("indented openers keep their indent on the content line and closer", () => {
    const view = makeEditor("  ``", 4, [fenceTypeAutoClose]);
    typeChar(view, "`");
    expect(text(view)).toBe("  ```\n  \n  ```");
    expect(view.state.selection.main.head).toBe("  ```\n  ".length);
  });

  it("a fence as a task item's direct content closes inside the item (§12.4)", () => {
    const doc = "- [ ] ``";
    const view = makeEditor(doc, doc.length, [fenceTypeAutoClose]);
    typeChar(view, "`");
    expect(text(view)).toBe("- [ ] ```\n      \n      ```");
    expect(view.state.selection.main.head).toBe("- [ ] ```\n      ".length);
  });

  it("a fence inside a blockquote carries the quote prefix onto both lines (§12.4)", () => {
    const doc = "> ``";
    const view = makeEditor(doc, doc.length, [fenceTypeAutoClose]);
    typeChar(view, "`");
    expect(text(view)).toBe("> ```\n> \n> ```");
  });

  it("backticks typed inside an existing code block stay literal", () => {
    const doc = "```\nco``\n```";
    const view = makeEditor(doc, doc.indexOf("co``") + 4, [fenceTypeAutoClose]);
    typeChar(view, "`");
    expect(text(view)).toBe("```\nco```\n```");
  });

  it("lengthening a closed opener does not stack another closer", () => {
    const view = makeEditor("```\n\n```", 3, [fenceTypeAutoClose]);
    typeChar(view, "`");
    expect(text(view)).toBe("````\n\n```");
  });

  it("pasting a fence does not trigger the close", () => {
    const view = makeEditor("", 0, [fenceTypeAutoClose]);
    view.dispatch({
      changes: { from: 0, insert: "```" },
      selection: { anchor: 3 },
      userEvent: "input.paste",
    });
    expect(text(view)).toBe("```");
  });
});

describe("fenceExitBlock — Enter on the empty last line leaves the block (§9.5)", () => {
  afterEach(destroyEditors);

  it("exits to the line after the closing fence", () => {
    const doc = "```\ncode\n\n```\nafter";
    const view = makeEditor(doc, doc.indexOf("\n\n```") + 1);
    expect(fenceExitBlock(view)).toBe(true);
    expect(text(view)).toBe("```\ncode\n```\nafter");
    expect(view.state.selection.main.head).toBe(text(view).indexOf("after"));
  });

  it("creates the line below when the block ends the document", () => {
    const doc = "```\ncode\n\n```";
    const view = makeEditor(doc, doc.indexOf("\n\n```") + 1);
    expect(fenceExitBlock(view)).toBe(true);
    expect(text(view)).toBe("```\ncode\n```\n");
    expect(view.state.selection.main.head).toBe(text(view).length);
  });

  it("declines on an empty line mid-block (Enter should add a code line)", () => {
    const doc = "```\n\ncode\n```";
    const view = makeEditor(doc, doc.indexOf("\n\ncode") + 1);
    expect(fenceExitBlock(view)).toBe(false);
  });

  it("declines in an unclosed block and on non-empty lines", () => {
    const unclosed = makeEditor("```\n\nswallowed", 4);
    expect(fenceExitBlock(unclosed)).toBe(false);

    const doc = "```\ncode\n```";
    const nonEmpty = makeEditor(doc, doc.indexOf("code") + 4);
    expect(fenceExitBlock(nonEmpty)).toBe(false);
  });
});
