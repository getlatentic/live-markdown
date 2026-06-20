// @vitest-environment jsdom
import { EditorSelection } from "@codemirror/state";
import { afterEach, describe, expect, it } from "vitest";

import { blockCommands } from "./blockCommands";
import { destroyEditors, makeEditor, text } from "./editorTestHarness";

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
