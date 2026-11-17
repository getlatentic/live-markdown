// @vitest-environment jsdom
//
// The paste converter (#134) against the clipboard HTML that real sources
// produce. Google Docs is the hostile one: a guid-carrying <b> wrapper whose
// font-weight is NORMAL around the whole fragment, and every piece of
// formatting expressed as <span style> — the naive conversion bolds the
// entire paste and loses all emphasis.
import { describe, expect, it } from "vitest";

import {
  COMPOSE_CLIPBOARD_ATTR,
  htmlToMarkdown,
  isComposeClipboardHtml,
} from "./htmlToMarkdown";

describe("htmlToMarkdown", () => {
  it("converts a Google Docs fragment: guid wrapper unwrapped, styled spans become emphasis", () => {
    const gdocs =
      `<meta charset="utf-8">` +
      `<b style="font-weight:normal;" id="docs-internal-guid-1a2b3c">` +
      `<p dir="ltr"><span style="font-size:11pt;font-weight:700;">Bold lead</span>` +
      `<span style="font-size:11pt;"> then plain and </span>` +
      `<span style="font-size:11pt;font-style:italic;">italic</span></p>` +
      `<ul><li dir="ltr"><p dir="ltr"><span style="font-size:11pt;">first item</span></p></li>` +
      `<li dir="ltr"><p dir="ltr"><span style="font-size:11pt;text-decoration:line-through;">struck item</span></p></li></ul>` +
      `</b>`;

    const markdown = htmlToMarkdown(gdocs);

    expect(markdown).toContain("**Bold lead**");
    expect(markdown).toContain("then plain and");
    expect(markdown).toContain("*italic*");
    expect(markdown).toContain("- first item");
    expect(markdown).toContain("~~struck item~~");
    // The guid wrapper must NOT bold the whole paste.
    expect(markdown.startsWith("**Bold lead** then plain")).toBe(true);
  });

  it("converts Word-flavored HTML: headings, real strong/em, mso classes ignored", () => {
    const word =
      `<h1>Chapter</h1>` +
      `<p class="MsoNormal"><b>Bold</b> and <i>italic</i> prose.</p>` +
      `<h2>Section</h2>`;

    const markdown = htmlToMarkdown(word);

    expect(markdown).toContain("# Chapter");
    expect(markdown).toContain("**Bold** and *italic* prose.");
    expect(markdown).toContain("## Section");
  });

  it("keeps nested and ordered lists aligned under tight markers", () => {
    const html =
      `<ul><li>outer<ul><li>inner</li></ul></li></ul>` +
      `<ol start="3"><li>third</li><li>fourth</li></ol>`;

    const markdown = htmlToMarkdown(html);

    expect(markdown).toContain("- outer");
    expect(markdown).toContain("  - inner");
    expect(markdown).toContain("3. third");
    expect(markdown).toContain("4. fourth");
  });

  it("converts tables to pipes and keeps links", () => {
    const html =
      `<table><thead><tr><th>Part</th><th>Focus</th></tr></thead>` +
      `<tbody><tr><td>A</td><td><a href="https://example.com">details</a></td></tr></tbody></table>`;

    const markdown = htmlToMarkdown(html);

    expect(markdown).toContain("| Part | Focus |");
    expect(markdown).toContain("[details](https://example.com)");
  });

  it("degrades images honestly: remote becomes a link, data: keeps only alt", () => {
    const html =
      `<p><img src="https://cdn.example.com/pic.png" alt="chart"></p>` +
      `<p><img src="data:image/png;base64,AAAA" alt="pasted blob"></p>`;

    const markdown = htmlToMarkdown(html);

    expect(markdown).toContain("[chart](https://cdn.example.com/pic.png)");
    expect(markdown).not.toContain("![");
    expect(markdown).not.toContain("data:image");
    expect(markdown).toContain("pasted blob");
  });

  it("strips style/script blocks entirely", () => {
    const html = `<style>p{color:red}</style><script>alert(1)</script><p>kept</p>`;
    expect(htmlToMarkdown(html)).toBe("kept");
  });

  it("returns empty for whitespace-only fragments so callers fall back to plain paste", () => {
    expect(htmlToMarkdown("<div>   \n </div>")).toBe("");
  });
});

describe("isComposeClipboardHtml", () => {
  it("recognizes our own marker and nothing else", () => {
    expect(isComposeClipboardHtml(`<div ${COMPOSE_CLIPBOARD_ATTR}="true"><p>x</p></div>`)).toBe(
      true,
    );
    expect(isComposeClipboardHtml("<p>ordinary</p>")).toBe(false);
  });
});
