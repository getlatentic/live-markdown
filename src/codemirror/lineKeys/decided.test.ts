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
    ["a paragraph", "word‸ text", "word\n‸text"],
    ["a quote", "> word‸ text", "> word\n> ‸text"],
    ["a bullet", "- word‸ text", "- word\n- ‸text"],
    ["an item's second line", "- one\n  word‸ text", "- one\n  word\n  ‸text"],
  ])("in %s", (_name, doc, split) => {
    expect(enter(doc)).toBe(split);
  });

});

describe("Enter at the end of a heading in a quote", () => {
  it("carries the quote on to the new line", () => {
    expect(enter("> ## word‸")).toBe("> ## word\n> ‸");
  });
});

describe("Enter at the start of an item's second line", () => {
  it.each([
    ["a bullet", "- one\n  ‸more", "- one\n\n  ‸more"],
    ["a number", "1. one\n   ‸more", "1. one\n\n   ‸more"],
    ["a task", "- [ ] one\n  ‸more", "- [ ] one\n\n  ‸more"],
  ])("opens an empty line above it in %s", (_name, doc, opened) => {
    expect(enter(doc)).toBe(opened);
  });
});

describe("Enter at the start of an item directly under a paragraph", () => {
  it.each([
    ["a number", "text\n1. ‸one", "text\n\n1.\n1. ‸one"],
    ["a bullet", "text\n- ‸one", "text\n\n-\n- ‸one"],
  ])("keeps %s a list item", (_name, doc, opened) => {
    expect(enter(doc)).toBe(opened);
  });
});

describe("Tab outside a list", () => {
  it.each(["‸word", "## ‸word", "> ‸word", "- one\n  ‸more"])("is taken and changes nothing in %j", (doc) => {
    const view = mount(doc);
    expect(press(view, "Tab")).toBe(true);
    expect(press(view, "Tab", true)).toBe(true);
    expect(marked(view)).toBe(doc);
    unmount(view);
  });
});

describe("a code fence typed in front of text", () => {
  it("wraps that line, and leaves the lines below as they were", () => {
    expect(typed("‸word text\nbelow", "```")).toBe("```‸\nword text\n```\nbelow");
  });

  it("takes one word as the language being named", () => {
    expect(typed("``‸js", "`")).toBe("```‸js");
  });
});

describe("a marker typed in front of a line's own marker", () => {
  it.each([
    ["a heading for a bullet", "- ‸word", "# ", "# ‸word"],
    ["a heading for a task", "- [ ] ‸word", "## ", "## ‸word"],
    ["a bullet for a heading", "## ‸word", "- ", "- ‸word"],
    ["a number for a bullet", "- ‸word", "1. ", "1. ‸word"],
    ["a bullet for a number", "1. ‸word", "- ", "- ‸word"],
    ["a quote for a heading", "## ‸word", "> ", "> ‸word"],
    ["another level for a heading", "## ‸word", "# ", "# ‸word"],
    ["a nested bullet's heading", "- one\n  - ‸word", "# ", "- one\n  # ‸word"],
  ])("replaces it: %s", (_name, doc, text, replaced) => {
    expect(typed(doc, text)).toBe(replaced);
  });

  it.each([
    ["a bullet in a bullet", "- ‸word", "- ", "- - ‸word"],
    ["a number in a number", "1. ‸word", "1. ", "1. 1. ‸word"],
    ["a marker after text", "- a‸word", "# ", "- a# ‸word"],
  ])("is left as typed: %s", (_name, doc, text, same) => {
    expect(typed(doc, text)).toBe(same);
  });
});

const backspace = (doc: string): string => after(doc, (view) => press(view, "Backspace"));
const tab = (doc: string): string => after(doc, (view) => press(view, "Tab"));

describe("a key pressed over a selection", () => {
  it.each([
    ["Enter in an item makes the rest the next item", enter, "- one «two» three", "- one\n- ‸three"],
    ["Enter over a whole item's text leaves an empty item above", enter, "- «one»", "-\n- ‸"],
    ["Enter across two items splits where the selection began", enter, "- one «two\n- three» four", "- one\n- ‸four"],
    ["Enter in a quote keeps both halves in the quote", enter, "> one «two» three", "> one\n> ‸three"],
    ["Backspace over a line's first word takes the space after it", backspace, "- «word» text", "- ‸text"],
    ["Backspace over a later word leaves the spaces", backspace, "one «two» three", "one ‸ three"],
    ["Tab nests every selected item", tab, "- one\n- «two\n- three»", "- one\n  - «two\n  - three»"],
  ])("%s", (_name, key, doc, result) => {
    expect(key(doc)).toBe(result);
  });
});

describe("Enter in a numbered list", () => {
  it("counts the items below on from the new one", () => {
    expect(enter("1. a‸b\n2. c\n3. d")).toBe("1. a\n2. ‸b\n3. c\n4. d");
  });

  it("leaves numbers that do not count up as they are", () => {
    expect(enter("1. a‸b\n1. c")).toBe("1. a\n2. ‸b\n1. c");
  });

  it("opens an item above a nested one after an empty line, where it reads as an item", () => {
    expect(enter("- one\n   1. ‸two")).toBe("- one\n\n   1.\n   1. ‸two");
  });
});

describe("Enter in a list with gaps", () => {
  it("puts the new item directly below, as in a list without them", () => {
    expect(enter("- zero\n\n- one‸ two")).toBe("- zero\n\n- one\n- ‸two");
  });
});

describe("Enter in a line of a quote written without its mark", () => {
  it.each([
    ["at its start", "> said\n‸word text", "> said\n>\n> ‸word text"],
    ["in its text", "> said\nword‸ text", "> said\nword\n> ‸text"],
  ])("keeps both lines in the quote: %s", (_name, doc, result) => {
    expect(enter(doc)).toBe(result);
  });
});

describe("Backspace at the start of a heading under a code block", () => {
  it("leaves both whole and puts the caret beside the block", () => {
    expect(backspace("```\ncode\n```\n## ‸Title")).toBe("```\ncode‸\n```\n## Title");
  });
});
