// @vitest-environment jsdom
import { syntaxTree } from "@codemirror/language";
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "./editorTestHarness";
import { renderInlineCell } from "./tableInline";

/** Render the first `TableCell` (the header cell) of a one-column table. */
function renderFirstCell(cell: string): string {
  const view = makeEditor(`| ${cell} |\n| --- |\n| x |`, 0);
  let html: string | null = null;
  syntaxTree(view.state).iterate({
    enter(node) {
      if (node.name === "TableCell" && html === null) {
        html = renderInlineCell(view.state, node.node);
      }
    },
  });
  return html ?? "";
}

describe("renderInlineCell", () => {
  afterEach(destroyEditors);

  it("styles bold, italic, and code with the editor's own mark classes", () => {
    expect(renderFirstCell("**b**")).toBe('<span class="cm-strong">b</span>');
    expect(renderFirstCell("*i*")).toBe('<span class="cm-emphasis">i</span>');
    expect(renderFirstCell("`c`")).toBe('<span class="cm-inline-code">c</span>');
  });

  it("passes strikethrough through raw — render-raw in the body too, so cells match", () => {
    expect(renderFirstCell("~~s~~")).toBe("~~s~~");
  });

  it("renders a link as an anchor carrying its URL and the link class", () => {
    expect(renderFirstCell("[label](http://example.com)")).toBe(
      '<a href="http://example.com" class="cm-link">label</a>',
    );
  });

  it("renders mixed inline content with the plain-text gaps intact", () => {
    expect(renderFirstCell("a **b** c `d`")).toBe(
      'a <span class="cm-strong">b</span> c <span class="cm-inline-code">d</span>',
    );
  });

  it("renders nested markup (a link inside bold)", () => {
    expect(renderFirstCell("**[t](u)**")).toBe(
      '<span class="cm-strong"><a href="u" class="cm-link">t</a></span>',
    );
  });

  it("entity-escapes literal angle brackets inside code", () => {
    expect(renderFirstCell("`a<b`")).toBe('<span class="cm-inline-code">a&lt;b</span>');
  });

  it("passes literal <br> through untouched for the cell's sanitiser", () => {
    expect(renderFirstCell("a<br>b")).toBe("a<br>b");
  });

  it("keeps an escaped pipe verbatim (one cell, no split)", () => {
    expect(renderFirstCell("x \\| y")).toBe("x \\| y");
  });

  it("leaves plain text unchanged", () => {
    expect(renderFirstCell("just text")).toBe("just text");
  });
});
