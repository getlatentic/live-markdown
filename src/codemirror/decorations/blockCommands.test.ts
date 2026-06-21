// @vitest-environment jsdom
import { EditorSelection } from "@codemirror/state";
import { afterEach, describe, expect, it } from "vitest";

import { blockCommands } from "./blockCommands";
import { destroyEditors, makeEditor, text } from "./editorTestHarness";

const TABLE_SKELETON = "| Header | Header |\n| --- | --- |\n| Cell | Cell |";

describe("blockCommands — heading / list / quote toggles", () => {
  afterEach(destroyEditors);

  it("toggles a heading on and off", () => {
    const view = makeEditor("title", 0);
    blockCommands.toggleHeading2(view);
    expect(text(view)).toBe("## title");
    blockCommands.toggleHeading2(view);
    expect(text(view)).toBe("title");
  });

  it("swaps the heading level in place", () => {
    const view = makeEditor("# a", 3);
    blockCommands.toggleHeading2(view);
    expect(text(view)).toBe("## a");
  });

  it("toggles a bullet, and converts an ordered item to a bullet", () => {
    const view = makeEditor("item", 0);
    blockCommands.toggleBulletList(view);
    expect(text(view)).toBe("- item");
    blockCommands.toggleBulletList(view);
    expect(text(view)).toBe("item");

    const ordered = makeEditor("1. item", 0);
    blockCommands.toggleBulletList(ordered);
    expect(text(ordered)).toBe("- item");
  });

  it("numbers an ordered list across a multi-line selection", () => {
    const view = makeEditor("a\nb", 0);
    view.dispatch({ selection: EditorSelection.range(0, 3) }); // span both lines
    blockCommands.toggleOrderedList(view);
    expect(text(view)).toBe("1. a\n2. b");
  });

  it("toggles a blockquote on and off", () => {
    const view = makeEditor("q", 0);
    blockCommands.toggleBlockquote(view);
    expect(text(view)).toBe("> q");
    blockCommands.toggleBlockquote(view);
    expect(text(view)).toBe("q");
  });
});

describe("blockCommands — insert table", () => {
  afterEach(destroyEditors);

  it("inserts a 2x2 GFM skeleton in place on an empty document", () => {
    const view = makeEditor("", 0);
    blockCommands.insertTable(view);
    expect(text(view)).toBe(TABLE_SKELETON);
  });

  it("pushes the table below the current line with a separating blank line", () => {
    const view = makeEditor("intro", 5);
    blockCommands.insertTable(view);
    expect(text(view)).toBe(`intro\n\n${TABLE_SKELETON}`);
  });

  it("reuses an existing blank line instead of adding another", () => {
    const view = makeEditor("intro\n", 6); // caret on the trailing blank line
    blockCommands.insertTable(view);
    expect(text(view)).toBe(`intro\n${TABLE_SKELETON}`);
  });

  it("selects the first header cell so the user can type the column name", () => {
    const view = makeEditor("", 0);
    blockCommands.insertTable(view);
    const { from, to } = view.state.selection.main;
    expect(view.state.sliceDoc(from, to)).toBe("Header");
  });
});
