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
    ["in the middle of the heading, splits it", "## Opening", 6, "## Ope\nning"],
    ["on a heading with no text, opens a line below", "## ", 3, "## \n"],
    ["on a line that is not a heading, opens a line above", "Opening", 0, "\nOpening"],
  ])("%s", (_name, doc, at, result) => {
    const view = makeEditor(doc, at);
    expect(lineKey(view, "Enter")).toBe(true);
    expect(text(view)).toBe(result);
  });
});
