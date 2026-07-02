// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor, text } from "./editorTestHarness";
import { fenceAutoClose } from "./fenceAutoClose";

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

  it("declines inside the code content of an unclosed fence", () => {
    // Enter while typing code must stay a plain newline — only the opening
    // line auto-closes.
    const doc = "```\nlet x = 1";
    const view = makeEditor(doc, doc.length);
    expect(fenceAutoClose(view)).toBe(false);
  });
});
