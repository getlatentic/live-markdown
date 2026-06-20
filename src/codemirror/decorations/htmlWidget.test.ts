// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "./editorTestHarness";
import { HtmlWidget } from "./htmlWidget";

describe("HtmlWidget — sanitized inline HTML rendering", () => {
  afterEach(destroyEditors);

  it("renders safe markup as real DOM", () => {
    const view = makeEditor("x", 0);
    const dom = new HtmlWidget("<b>bold</b> <em>it</em>", false).toDOM(view);
    expect(dom.querySelector("b")?.textContent).toBe("bold");
    expect(dom.querySelector("em")?.textContent).toBe("it");
  });

  it("strips <script> and other dangerous tags (DOMPurify)", () => {
    const view = makeEditor("x", 0);
    const dom = new HtmlWidget("<b>ok</b><script>alert(1)</script>", false).toDOM(view);
    expect(dom.querySelector("script")).toBeNull();
    expect(dom.querySelector("b")?.textContent).toBe("ok");
  });

  it("strips inline event handlers", () => {
    const view = makeEditor("x", 0);
    const dom = new HtmlWidget('<img src="x" onerror="alert(1)">', false).toDOM(view);
    expect(dom.querySelector("img")?.getAttribute("onerror")).toBeNull();
  });

  it("uses a <div>.cm-html-block for block, <span>.cm-html-inline for inline", () => {
    const view = makeEditor("x", 0);
    const block = new HtmlWidget("<p>hi</p>", true).toDOM(view);
    const inline = new HtmlWidget("<b>hi</b>", false).toDOM(view);
    expect(block.tagName).toBe("DIV");
    expect(block.className).toBe("cm-html-block");
    expect(inline.tagName).toBe("SPAN");
    expect(inline.className).toBe("cm-html-inline");
  });
});
