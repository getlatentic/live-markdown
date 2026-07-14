// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { linkActionAt, linkUrlAt, wikilinkTargetAt } from "./clickModel";
import { destroyEditors, makeEditor } from "../core/editorTestHarness";
import { wikilinkFromPathFacet, wikilinkTargetsFacet } from "../wikilink/wikilinkPlugin";

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

describe("linkActionAt", () => {
  afterEach(destroyEditors);

  it("navigates a markdown link that names a known workspace file", () => {
    const doc = "see [the plan](positioning.md) here";
    const view = makeEditor(doc, 0, [wikilinkTargetsFacet.of(new Set(["positioning.md"]))]);
    expect(linkActionAt(view, doc.indexOf("the plan"))).toEqual({
      kind: "navigate",
      path: "positioning.md",
    });
  });

  it("resolves a relative markdown link against the document's folder", () => {
    const doc = "see [sibling](other.md) now";
    const view = makeEditor(doc, 0, [
      wikilinkFromPathFacet.of("notes/sub/here.md"),
      wikilinkTargetsFacet.of(new Set(["notes/sub/other.md"])),
    ]);
    expect(linkActionAt(view, doc.indexOf("sibling"))).toEqual({
      kind: "navigate",
      path: "notes/sub/other.md",
    });
  });

  it("opens a markdown link with a URI scheme in the browser", () => {
    const doc = "see [docs](https://example.com/x) now";
    const view = makeEditor(doc, 0, [wikilinkTargetsFacet.of(new Set())]);
    expect(linkActionAt(view, doc.indexOf("docs"))).toEqual({
      kind: "open",
      href: "https://example.com/x",
    });
  });

  it("returns null for a markdown link to an unknown file (broken link)", () => {
    const doc = "see [ghost](missing.md) now";
    const view = makeEditor(doc, 0, [wikilinkTargetsFacet.of(new Set(["positioning.md"]))]);
    expect(linkActionAt(view, doc.indexOf("ghost"))).toBeNull();
  });

  it("navigates a [[wikilink]] to a known file", () => {
    const doc = "go to [[note]] please";
    const view = makeEditor(doc, 0, [wikilinkTargetsFacet.of(new Set(["note.md"]))]);
    expect(linkActionAt(view, doc.indexOf("note"))).toEqual({
      kind: "navigate",
      path: "note.md",
    });
  });
});
