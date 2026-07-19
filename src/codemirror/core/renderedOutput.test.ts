// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeFullEditor } from "./editorTestHarness";

/**
 * What the USER SEES — the rendered output, not the markdown source.
 *
 * The block-command / source-level tests assert what's written to the document;
 * this suite asserts what's drawn for it, through the *full* editor extension
 * set (wikilinks, highlight, footnotes, math, tables — not just the base
 * decorations). That layer was previously untested, which is how a numbered
 * list rendering as bullets and a task item drawing both a bullet and a checkbox
 * shipped unnoticed.
 */

/** The visible text of each rendered line (hidden markers gone, widgets in). */
function seen(doc: string): string[] {
  const view = makeFullEditor(doc, 0);
  return [...view.contentDOM.querySelectorAll(".cm-line")].map((line) => line.textContent ?? "");
}

describe("rendered output — what the user sees", () => {
  afterEach(destroyEditors);

  it("hides heading / emphasis / code markers, leaving the content", () => {
    expect(seen("# Title")).toEqual(["Title"]);
    expect(seen("**b** *i* `c`")).toEqual(["b i c"]);
  });

  it("a bare pasted URL stays VISIBLE, styled as a link", () => {
    // Field report: pasted URLs vanished (the registry's URL hide-always was
    // written for [text](url), but bare autolinks emit the same node) —
    // leaving an invisible, unclickable dead zone the user pasted into
    // repeatedly because nothing appeared.
    expect(seen("open ai build day: https://openai.devpost.com/x")).toEqual([
      "open ai build day: https://openai.devpost.com/x",
    ]);
    const view = makeFullEditor("see https://a.b/c now", 0);
    const link = view.contentDOM.querySelector(".cm-link");
    expect(link?.textContent).toBe("https://a.b/c");
  });

  it("an <angle> autolink shows its URL (brackets hidden)", () => {
    expect(seen("go <https://a.b/c> now")).toEqual(["go https://a.b/c now"]);
  });

  it("a [label](url) link still shows ONLY the label", () => {
    expect(seen("see [docs](https://a.b/c) now")).toEqual(["see docs now"]);
  });

  it("an EMPTY-label link shows its URL — never an invisible hole", () => {
    // Same dead-zone class as the bare-URL report, one sibling over: with the
    // label and marks hidden, the URL was the link's only visible content.
    expect(seen("a [](https://x.dev/page) b")).toEqual(["a https://x.dev/page b"]);
    expect(seen("a [ ](https://y.dev/q) b")).toEqual(["a  https://y.dev/q b"]);
  });

  it("the caret can sit inside a bare URL (no atomic dead zone)", () => {
    const doc = "x https://a.b/c y";
    const view = makeFullEditor(doc, 0);
    const inside = doc.indexOf("a.b") + 1;
    view.dispatch({ selection: { anchor: inside } });
    expect(view.state.selection.main.head).toBe(inside);
  });

  // ── INVARIANT: nothing the user typed renders invisibly ────────────────────
  // The registry hides construct CHROME; it must never hide CONTENT. Each row
  // plants a sentinel in a position that has bitten (or could): the sentinel
  // must appear in the rendered text. Bare URLs (#157), setext underlines, and
  // angle-bracket placeholders all failed this before their fixes — new
  // constructs add a row here.
  describe("no user text becomes invisible", () => {
    const CASES: Array<[name: string, doc: string, sentinel: string]> = [
      ["bare pasted URL", "day: https://x.dev/SENTINEL9 end", "https://x.dev/SENTINEL9"],
      ["angle autolink", "go <https://x.dev/SENTINEL9> now", "https://x.dev/SENTINEL9"],
      ["email autolink", "mail <sentinel9@x.dev> now", "sentinel9@x.dev"],
      ["setext H1 underline", "Title\n===", "==="],
      ["setext H2 underline", "Title\n---", "---"],
      ["angle-bracket placeholder", "Dear <SENTINEL9>, hi", "<SENTINEL9>"],
      ["stray closing tag", "a </b> c", "</b>"],
      ["stripped script tag", "a <script>SENTINEL9</script> c", "SENTINEL9"],
      ["reference link label", "see [SENTINEL9][1] end\n\n[1]: https://x.dev", "SENTINEL9"],
      ["html comment", "a <!-- SENTINEL9 --> c", "SENTINEL9"],
      ["entity", "a &amp;SENTINEL9 c", "SENTINEL9"],
      // Code is literal: an inline construct's syntax inside a code context
      // must render verbatim, never as its rich form (export parity, #167).
      ["wikilink in a fenced code block", "```bash\nnpm i [[SENTINEL9]]\n```", "[[SENTINEL9]]"],
      ["wikilink in inline code", "run `use [[SENTINEL9]] here` now", "[[SENTINEL9]]"],
      ["highlight marks in a fenced code block", "```\na ==SENTINEL9== b\n```", "==SENTINEL9=="],
      ["footnote ref in a fenced code block", "```\nsee [^SENTINEL9] end\n```", "[^SENTINEL9]"],
      ["inline math in inline code", "a `costs $SENTINEL9$ x` b", "$SENTINEL9$"],
      ["math block marks in a fenced code block", "```\n$$\nSENTINEL9\n$$\n```", "$$"],
    ];
    for (const [name, doc, sentinel] of CASES) {
      it(name, () => {
        expect(seen(doc).join("\n")).toContain(sentinel);
      });
    }
  });

  it("draws a bullet as • and an ordered item as its number — never a bullet", () => {
    expect(seen("- item")).toEqual(["•item"]);
    expect(seen("1. first\n2. second")).toEqual(["1.first", "2.second"]);
    // The regression behind #22: an ordered mark must not render as a bullet.
    expect(seen("3. lonely")).toEqual(["3.lonely"]);
  });

  it("renumbers an ordered list on display (CommonMark), ignoring source digits", () => {
    expect(seen("1. a\n1. b\n1. c")).toEqual(["1.a", "2.b", "3.c"]);
    // Starts at the first item's number, then sequential.
    expect(seen("3. a\n9. b")).toEqual(["3.a", "4.b"]);
  });

  it("re-numbers live when an item is removed", () => {
    const view = makeFullEditor("1. a\n1. b\n1. c", 0);
    const numbers = () =>
      [...view.contentDOM.querySelectorAll(".cm-ordered-marker")].map((e) => e.textContent);
    expect(numbers()).toEqual(["1.", "2.", "3."]);
    view.dispatch({ changes: { from: 0, to: 5, insert: "" } }); // remove the first item
    expect(numbers()).toEqual(["1.", "2."]);
  });

  it("re-numbers live when an item is inserted", () => {
    const view = makeFullEditor("1. a\n1. b", 0);
    const numbers = () =>
      [...view.contentDOM.querySelectorAll(".cm-ordered-marker")].map((e) => e.textContent);
    expect(numbers()).toEqual(["1.", "2."]);
    view.dispatch({ changes: { from: 5, insert: "1. mid\n" } }); // insert a new second item
    expect(numbers()).toEqual(["1.", "2.", "3."]); // the former second item renumbers to 3
  });

  it("keeps the number marker rendered while typing into an item", () => {
    // The contract behind #37: editing an item's text must not drop its marker
    // back to raw `1.` source. (The shipped flicker was an incomplete-parse race
    // the editor now guards against by force-parsing the viewport.)
    const view = makeFullEditor("1. a\n2. b", 0);
    const numbers = () =>
      [...view.contentDOM.querySelectorAll(".cm-ordered-marker")].map((e) => e.textContent);
    expect(numbers()).toEqual(["1.", "2."]);
    view.dispatch({ changes: { from: view.state.doc.length, insert: "more" } });
    expect(numbers()).toEqual(["1.", "2."]);
  });

  it("renders a nested ordered sublist starting at 1", () => {
    // The result of indenting two items under a parent (#40): the sublist is a
    // separate ordered list, so it renumbers from 1 by position.
    const view = makeFullEditor("1. parent\n   1. child\n   1. second", 0);
    const numbers = [...view.contentDOM.querySelectorAll(".cm-ordered-marker")].map(
      (e) => e.textContent,
    );
    expect(numbers).toEqual(["1.", "1.", "2."]);
  });

  it("draws a task item as a checkbox, with no bullet beside it", () => {
    const content = makeFullEditor("- [ ] todo", 0).contentDOM;
    expect(content.querySelector(".cm-task-checkbox")).not.toBeNull();
    expect(content.querySelector(".cm-bullet-widget")).toBeNull();
  });

  it("hides wikilink brackets, showing the name (or the alias)", () => {
    expect(seen("[[Note Name]]")).toEqual(["Note Name"]);
    expect(seen("[[target|Alias]]")).toEqual(["Alias"]);
  });

  it("keeps [[…]] literal inside a fenced code block", () => {
    expect(seen("```bash\nnpm i [[not-a-link]]\n```")).toEqual([
      "bash",
      "npm i [[not-a-link]]",
      "",
    ]);
  });

  it("hides markdown-link and highlight markers, leaving the visible text", () => {
    expect(seen("[text](http://example.com)")).toEqual(["text"]);
    expect(seen("==marked==")).toEqual(["marked"]);
  });

  it("tags a blockquote line so it can be styled", () => {
    const line = makeFullEditor("> quoted", 0).contentDOM.querySelector(".cm-line");
    expect(line?.className).toContain("cm-blockquote");
  });
});
