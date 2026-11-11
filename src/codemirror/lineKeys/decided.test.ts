// @vitest-environment jsdom
// Rules decided against what other editors do, each run through the editor's
// own bindings. The full table is in model/line-keys.tsv.
import { describe, expect, it } from "vitest";

import { marked, mount, press, type, unmount } from "./drive";

function after(doc: string, act: (view: ReturnType<typeof mount>) => void): string {
  const view = mount(doc);
  try {
    act(view);
    return marked(view);
  } finally {
    unmount(view);
  }
}

const enter = (doc: string): string => after(doc, (view) => press(view, "Enter"));
const typed = (doc: string, text: string): string => after(doc, (view) => type(view, text));

describe("Enter in front of a space starts the new line without it", () => {
  it.each([
    ["a paragraph", "word| text", "word\n|text"],
    ["a quote", "> word| text", "> word\n> |text"],
    ["a bullet", "- word| text", "- word\n- |text"],
    ["an item's second line", "- one\n  word| text", "- one\n  word\n  |text"],
  ])("in %s", (_name, doc, split) => {
    expect(enter(doc)).toBe(split);
  });

});

describe("Enter at the end of a heading in a quote", () => {
  it("carries the quote on to the new line", () => {
    expect(enter("> ## word|")).toBe("> ## word\n> |");
  });
});

describe("Enter at the start of an item's second line", () => {
  it.each([
    ["a bullet", "- one\n  |more", "- one\n\n  |more"],
    ["a number", "1. one\n   |more", "1. one\n\n   |more"],
    ["a task", "- [ ] one\n  |more", "- [ ] one\n\n  |more"],
  ])("opens an empty line above it in %s", (_name, doc, opened) => {
    expect(enter(doc)).toBe(opened);
  });
});

describe("Enter at the start of an item directly under a paragraph", () => {
  it.each([
    ["a number", "text\n1. |one", "text\n\n1.\n1. |one"],
    ["a bullet", "text\n- |one", "text\n\n-\n- |one"],
  ])("keeps %s a list item", (_name, doc, opened) => {
    expect(enter(doc)).toBe(opened);
  });
});

describe("Tab outside a list", () => {
  it.each(["|word", "## |word", "> |word", "- one\n  |more"])("is taken and changes nothing in %j", (doc) => {
    const view = mount(doc);
    expect(press(view, "Tab")).toBe(true);
    expect(press(view, "Tab", true)).toBe(true);
    expect(marked(view)).toBe(doc);
    unmount(view);
  });
});

describe("a code fence typed in front of text", () => {
  it("wraps that line, and leaves the lines below as they were", () => {
    expect(typed("|word text\nbelow", "```")).toBe("```|\nword text\n```\nbelow");
  });

  it("takes one word as the language being named", () => {
    expect(typed("``|js", "`")).toBe("```|js");
  });
});

describe("a marker typed in front of a line's own marker", () => {
  it.each([
    ["a heading for a bullet", "- |word", "# ", "# |word"],
    ["a heading for a task", "- [ ] |word", "## ", "## |word"],
    ["a bullet for a heading", "## |word", "- ", "- |word"],
    ["a number for a bullet", "- |word", "1. ", "1. |word"],
    ["a bullet for a number", "1. |word", "- ", "- |word"],
    ["a quote for a heading", "## |word", "> ", "> |word"],
    ["another level for a heading", "## |word", "# ", "# |word"],
    ["a nested bullet's heading", "- one\n  - |word", "# ", "- one\n  # |word"],
  ])("replaces it: %s", (_name, doc, text, replaced) => {
    expect(typed(doc, text)).toBe(replaced);
  });

  it.each([
    ["a bullet in a bullet", "- |word", "- ", "- - |word"],
    ["a number in a number", "1. |word", "1. ", "1. 1. |word"],
    ["a marker after text", "- a|word", "# ", "- a# |word"],
  ])("is left as typed: %s", (_name, doc, text, same) => {
    expect(typed(doc, text)).toBe(same);
  });
});
