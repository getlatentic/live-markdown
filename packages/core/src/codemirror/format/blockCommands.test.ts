// @vitest-environment jsdom
import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { blockCommands } from "./blockCommands";
import { destroyEditors, makeEditor, text } from "../core/editorTestHarness";

/** Editor over `doc` with the caret ON the line containing `marker` (at its
 * first character). */
function editorAtLine(doc: string, marker: string): EditorView {
  const pos = doc.indexOf(marker);
  if (pos < 0) throw new Error(`marker ${JSON.stringify(marker)} not in doc`);
  return makeEditor(doc, pos);
}

function selectAll(view: EditorView): void {
  view.dispatch({ selection: EditorSelection.range(0, view.state.doc.length) });
}

describe("blockCommands — code is off-limits (#61)", () => {
  afterEach(destroyEditors);

  it("bullet toggle inside a fenced block leaves the code alone", () => {
    // `- item` inside a fence is code, not a list — a regex can't tell.
    const view = editorAtLine("```\n- item\n```", "- item");
    blockCommands.toggleBulletList(view);
    expect(text(view)).toBe("```\n- item\n```");
  });

  it("heading toggle inside a fenced block leaves the code alone", () => {
    const view = editorAtLine("```\ncode line\n```", "code line");
    blockCommands.toggleHeading2(view);
    expect(text(view)).toBe("```\ncode line\n```");
  });

  it("task toggle on the fence line itself is a no-op", () => {
    const view = editorAtLine("```\ncode\n```", "```");
    blockCommands.toggleTaskList(view);
    expect(text(view)).toBe("```\ncode\n```");
  });

  it("blockquote toggle inside a fenced block leaves the code alone", () => {
    const view = editorAtLine("```\ncode line\n```", "code line");
    blockCommands.toggleBlockquote(view);
    expect(text(view)).toBe("```\ncode line\n```");
  });

  it("a selection spanning prose and a fence only formats the prose", () => {
    const view = makeEditor("intro\n```\ncode\n```\noutro", 0);
    selectAll(view);
    blockCommands.toggleBulletList(view);
    expect(text(view)).toBe("- intro\n```\ncode\n```\n- outro");
  });

  it("top-level indented code is protected too", () => {
    const view = editorAtLine("para\n\n    - looks like a bullet", "- looks");
    blockCommands.toggleBulletList(view);
    expect(text(view)).toBe("para\n\n    - looks like a bullet");
  });
});

describe("blockCommands — nested list items (#61)", () => {
  afterEach(destroyEditors);

  it("bullet toggle strips a nested item's marker in place", () => {
    // The nested marker isn't at column 0; editing must land where the parser
    // saw it, not prepend a second marker.
    const view = editorAtLine("- a\n  - b", "- b");
    blockCommands.toggleBulletList(view);
    expect(text(view)).toBe("- a\n  b");
  });

  it("bullet toggle strips a whole nested selection", () => {
    const view = makeEditor("- a\n  - b", 0);
    selectAll(view);
    blockCommands.toggleBulletList(view);
    expect(text(view)).toBe("a\n  b");
  });

  it("ordered toggle strips a nested ordered item in place", () => {
    const view = editorAtLine("1. a\n   1. b", "1. b");
    blockCommands.toggleOrderedList(view);
    expect(text(view)).toBe("1. a\n   b");
  });

  it("a list-item continuation line becomes a nested bullet, keeping its indent", () => {
    const view = editorAtLine("- a\n  b", "b");
    blockCommands.toggleBulletList(view);
    expect(text(view)).toBe("- a\n  - b");
  });

  it("four-space content under a list item is a nested item, not indented code", () => {
    const view = editorAtLine("- a\n    - b", "- b");
    blockCommands.toggleBulletList(view);
    expect(text(view)).toBe("- a\n    b");
  });
});

describe("blockCommands — quoted lines compose (#61)", () => {
  afterEach(destroyEditors);

  it("bullet toggle sees a list item through the quote marker", () => {
    const view = editorAtLine("> - item", "> - item");
    blockCommands.toggleBulletList(view);
    expect(text(view)).toBe("> item");
  });

  it("heading toggle lands after the quote marker", () => {
    const view = editorAtLine("> thought", "> thought");
    blockCommands.toggleHeading2(view);
    expect(text(view)).toBe("> ## thought");
  });

  it("blockquote toggle strips one level from a nested quote", () => {
    const view = editorAtLine("> > deep", "> > deep");
    blockCommands.toggleBlockquote(view);
    expect(text(view)).toBe("> deep");
  });

  it("blockquote toggle round-trips plain text", () => {
    const view = makeEditor("plain", 0);
    blockCommands.toggleBlockquote(view);
    expect(text(view)).toBe("> plain");
  });
});

describe("blockCommands — marker swaps land on the parsed marker", () => {
  afterEach(destroyEditors);

  it("heading toggle on the same level removes it", () => {
    const view = makeEditor("## title", 0);
    blockCommands.toggleHeading2(view);
    expect(text(view)).toBe("title");
  });

  it("heading toggle on another level swaps the marker", () => {
    const view = makeEditor("## title", 0);
    blockCommands.toggleHeading1(view);
    expect(text(view)).toBe("# title");
  });

  it("heading toggle replaces a whole task marker, checkbox included", () => {
    const view = makeEditor("- [ ] task", 0);
    blockCommands.toggleHeading2(view);
    expect(text(view)).toBe("## task");
  });

  it("bullet toggle converts an ordered item", () => {
    const view = makeEditor("1. x", 0);
    blockCommands.toggleBulletList(view);
    expect(text(view)).toBe("- x");
  });

  it("bullet toggle converts a heading", () => {
    const view = makeEditor("## x", 0);
    blockCommands.toggleBulletList(view);
    expect(text(view)).toBe("- x");
  });

  it("ordered toggle renumbers a mixed selection from 1", () => {
    const view = makeEditor("text\n- b\n1. c", 0);
    selectAll(view);
    blockCommands.toggleOrderedList(view);
    expect(text(view)).toBe("1. text\n2. b\n3. c");
  });

  it("a non-1 pseudo-marker on a continuation line is content, not a marker", () => {
    // CommonMark: an ordered list interrupts a paragraph only when it starts
    // at 1, so `5. c` here is lazy-continuation PROSE of the bullet above —
    // the toggle numbers the line and keeps its text verbatim.
    const view = makeEditor("text\n- b\n5. c", 0);
    selectAll(view);
    blockCommands.toggleOrderedList(view);
    expect(text(view)).toBe("1. text\n2. b\n3. 5. c");
  });

  it("ordered toggle strips a fully ordered selection", () => {
    const view = makeEditor("1. a\n2. b", 0);
    selectAll(view);
    blockCommands.toggleOrderedList(view);
    expect(text(view)).toBe("a\nb");
  });

  it("task toggle adds a checkbox to a plain bullet", () => {
    const view = makeEditor("- x", 0);
    blockCommands.toggleTaskList(view);
    expect(text(view)).toBe("- [ ] x");
  });

  it("task toggle strips a checked task entirely", () => {
    const view = makeEditor("- [x] done", 0);
    blockCommands.toggleTaskList(view);
    expect(text(view)).toBe("done");
  });
});

describe("blockCommands — code fence wrapping", () => {
  afterEach(destroyEditors);

  it("wraps the selected lines in a ``` fence", () => {
    const view = makeEditor("plain text", 0);
    view.dispatch({ selection: EditorSelection.range(0, 10) });
    blockCommands.toggleCodeBlock(view);
    expect(text(view)).toBe("```\nplain text\n```");
  });

  it("lengthens the fence past any backtick run in the content", () => {
    // Wrapping this with ``` would close the fence at the inner ``` and spill
    // the rest as prose — the fence must be one backtick longer.
    const view = makeEditor("docs say\n```\nnested\n```", 0);
    view.dispatch({ selection: EditorSelection.range(0, view.state.doc.length) });
    blockCommands.toggleCodeBlock(view);
    expect(text(view)).toBe("````\ndocs say\n```\nnested\n```\n````");
  });
});
