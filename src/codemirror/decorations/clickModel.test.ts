// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { linkUrlAt, wikilinkTargetAt } from "./clickModel";
import { destroyEditors, makeEditor } from "./editorTestHarness";
import { wikilinkTargetsFacet } from "./wikilinkPlugin";

describe("linkUrlAt", () => {
  afterEach(destroyEditors);

  it("returns the URL when the position sits inside a markdown link", () => {
    const doc = "see [docs](https://example.com/x) now";
    const view = makeEditor(doc, 0);
    expect(linkUrlAt(view, doc.indexOf("docs") + 1)).toBe("https://example.com/x");
  });

  it("returns null when the position is plain text", () => {
    const doc = "see [docs](https://example.com/x) now";
    const view = makeEditor(doc, 0);
    expect(linkUrlAt(view, doc.indexOf("now"))).toBeNull();
  });
});

describe("wikilinkTargetAt", () => {
  afterEach(destroyEditors);

  it("resolves a [[target]] under the cursor to a known workspace file", () => {
    const doc = "go to [[note]] please";
    const view = makeEditor(doc, 0, [wikilinkTargetsFacet.of(new Set(["note.md"]))]);
    expect(wikilinkTargetAt(view, doc.indexOf("note"))).toBe("note.md");
  });

  it("returns null when the position is not on a wikilink", () => {
    const doc = "go to [[note]] please";
    const view = makeEditor(doc, 0, [wikilinkTargetsFacet.of(new Set(["note.md"]))]);
    expect(wikilinkTargetAt(view, doc.indexOf("please"))).toBeNull();
  });

  it("returns null for an unresolvable target", () => {
    const doc = "go to [[ghost]] please";
    const view = makeEditor(doc, 0, [wikilinkTargetsFacet.of(new Set(["note.md"]))]);
    expect(wikilinkTargetAt(view, doc.indexOf("ghost"))).toBeNull();
  });
});
