// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { caret, destroyEditors, makeEditor, text } from "../core/editorTestHarness";
import { lineKey } from "./lineKey";

describe("Enter at the start of a heading", () => {
  afterEach(destroyEditors);

  it("moves the heading down and leaves an empty line above", () => {
    const doc = "Intro\n## Opening";
    const view = makeEditor(doc, doc.indexOf("Opening"));
    expect(lineKey(view, "Enter")).toBe(true);
    expect(text(view)).toBe("Intro\n\n## Opening");
    expect(caret(view)).toBe("Intro\n\n## ".length);
  });

  it("keeps a quoted heading in its quote", () => {
    const doc = "> ## Opening";
    const view = makeEditor(doc, doc.indexOf("Opening"));
    lineKey(view, "Enter");
    expect(text(view)).toBe("> \n> ## Opening");
  });

  it.each([
    ["in the middle of the heading", "## Opening", 6],
    ["on a heading with no text", "## ", 3],
    ["on a line that is not a heading", "Opening", 0],
  ])("leaves Enter to the other rules %s", (_name, doc, at) => {
    const view = makeEditor(doc, at);
    expect(lineKey(view, "Enter")).toBe(false);
    expect(text(view)).toBe(doc);
  });
});
