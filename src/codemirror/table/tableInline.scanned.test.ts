// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeFullEditor } from "../core/editorTestHarness";

/**
 * A cell renders what the body renders.
 *
 * Cells walk the Lezer tree, and four of the editor's constructs have no node
 * in it — they are found by scanning text. The tree walk was blind to all four,
 * so a cell showed markdown source where the paragraph above it showed
 * mathematics, a wikilink, a highlight, or a footnote marker.
 */

function cell(source: string): HTMLElement | null {
  const doc = ["| h |", "| --- |", `| ${source} |`].join("\n");
  return makeFullEditor(doc, 0).contentDOM.querySelector("td");
}

function body(source: string): string {
  const view = makeFullEditor(`z ${source} z`, 0);
  return [...view.contentDOM.querySelectorAll(".cm-line")].map((l) => l.textContent).join("");
}

describe("a table cell renders the constructs Lezer does not parse", () => {
  afterEach(destroyEditors);

  it("typesets inline math with KaTeX, as the body does", () => {
    const td = cell("$440 = 2 \\times \\frac{22}{7} \\times r$");
    expect(td?.querySelectorAll(".katex")).toHaveLength(1);
    expect(td?.textContent).not.toContain("\\times");
    expect(body("$440 = 2 \\times \\frac{22}{7} \\times r$")).toContain("440");
  });

  it("shows a wikilink's label, not its brackets", () => {
    const td = cell("[[Some Note]]");
    expect(td?.textContent).toBe("Some Note");
    expect(td?.querySelector(".cm-wikilink")?.textContent).toBe("Some Note");
  });

  it("uses a wikilink's alias when it has one", () => {
    // `\\|` is the only literal pipe in a GFM cell — a bare one starts a column,
    // so the alias form only exists in a cell in its escaped spelling.
    expect(cell("[[Some Note\\|the alias]]")?.textContent).toBe("the alias");
  });

  it("marks ==highlight== instead of showing the equals signs", () => {
    const td = cell("==marked==");
    expect(td?.textContent).toBe("marked");
    expect(td?.querySelector(".cm-highlight")).not.toBeNull();
  });

  it("draws a footnote reference as its marker", () => {
    const td = cell("text[^1]");
    expect(td?.textContent).toBe("text1");
    expect(td?.querySelector(".cm-footnote-ref")?.textContent).toBe("1");
  });

  it("keeps a construct literal inside a code span, as the body does", () => {
    const td = cell("`costs $5 x$ y`");
    expect(td?.textContent).toBe("costs $5 x$ y");
    expect(td?.querySelectorAll(".katex")).toHaveLength(0);
  });

  it("still renders the constructs Lezer DOES parse", () => {
    expect(cell("**bold** and `code`")?.innerHTML).toBe(
      '<span class="cm-strong">bold</span> and <span class="cm-inline-code">code</span>',
    );
  });

  it("renders math beside tree-parsed markup in one cell", () => {
    const td = cell("**r** is $r$ here");
    expect(td?.querySelector(".cm-strong")?.textContent).toBe("r");
    expect(td?.querySelectorAll(".katex")).toHaveLength(1);
  });

  it("leaves a span that cuts a parsed node in half alone", () => {
    // `$a **b** c$` spans whole children and renders; a `$` that opens outside a
    // node and closes inside it must not make the node render twice.
    const td = cell("$a **b** c$");
    expect(td?.textContent?.match(/b/g) ?? []).toHaveLength(1);
  });

  it("escapes document text rather than letting it become markup", () => {
    expect(cell("==<img src=x onerror=alert(1)>==")?.querySelector("img")).toBeNull();
  });
});
