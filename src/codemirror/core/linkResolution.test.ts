// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeFullEditor } from "./editorTestHarness";

/**
 * A `[…]` is a link only when it resolves. Lezer reports the bracket syntax;
 * the reference lookup CommonMark specifies is ours to do, and skipping it is
 * what ate brackets out of prose and LaTeX.
 */

function render(doc: string): { text: string; links: string[] } {
  const view = makeFullEditor(doc, 0);
  return {
    text: [...view.contentDOM.querySelectorAll(".cm-line")].map((l) => l.textContent).join("\n"),
    links: [...view.contentDOM.querySelectorAll(".cm-link")].map((l) => l.textContent ?? ""),
  };
}

const DEFINITION = "\n\n[ref]: https://x.dev";

describe("a bracketed span renders as a link only when it resolves", () => {
  afterEach(destroyEditors);

  it("inline [text](url): brackets are chrome", () => {
    const { text, links } = render("see [docs](https://x.dev) now");
    expect(text).toBe("see docs now");
    expect(links).toContain("docs");
  });

  it("shortcut [ref] WITH a definition: brackets are chrome", () => {
    const { text, links } = render(`see [ref] now${DEFINITION}`);
    expect(text.split("\n")[0]).toBe("see ref now");
    expect(links).toContain("ref");
  });

  it("shortcut [ref] with NO definition: brackets are the author's text", () => {
    const { text, links } = render("see [ref] now");
    expect(text).toBe("see [ref] now");
    expect(links).toEqual([]);
  });

  it("collapsed [ref][] resolves on its own label", () => {
    expect(render(`see [ref][] now${DEFINITION}`).text.split("\n")[0]).toBe("see ref[] now");
  });

  it("matches labels case-insensitively, collapsing whitespace", () => {
    expect(render("see [My  Ref] now\n\n[my ref]: https://x.dev").text.split("\n")[0]).toBe(
      "see My  Ref now",
    );
  });

  it("finds a definition nested in a blockquote", () => {
    expect(render("see [ref] now\n\n> [ref]: https://x.dev").text.split("\n")[0]).toBe(
      "see ref now",
    );
  });

  it("leaves an image's own brackets alone", () => {
    // `![alt](src)` is an Image, not a Link — its marks stay chrome regardless.
    expect(render("![alt](x.png)").text).not.toContain("![alt]");
  });

  it("keeps every bracket of a pasted LaTeX block", () => {
    const tikz = "\\begin{tikzpicture}[scale=0.42]\n\\draw (0,0)++(0:0.7) arc[radius=0.7];";
    expect(render(tikz).text).toBe(tikz);
  });
});
