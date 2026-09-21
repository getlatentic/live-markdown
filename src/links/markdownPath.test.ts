import { describe, expect, it } from "vitest";
import { markdownExtension, markdownExtensionRank, stripMarkdownExtension } from "./markdownPath";

describe("which paths are Markdown notes", () => {
  it("knows every Markdown extension, in any case, and nothing else", () => {
    expect(markdownExtension("notes/Plan.MD")).toBe("MD");
    expect(markdownExtension("x.markdown")).toBe("markdown");
    expect(markdownExtension("todo.txt")).toBeNull();
    expect(markdownExtension(".md")).toBeNull();
    expect(markdownExtension("dir.md/file")).toBeNull();
  });

  it("strips only a Markdown extension", () => {
    expect(stripMarkdownExtension("notes/v1.2.mdown")).toBe("notes/v1.2");
    expect(stripMarkdownExtension("todo.txt")).toBe("todo.txt");
  });

  it("ranks .md first", () => {
    expect(markdownExtensionRank("a.md")).toBeLessThan(markdownExtensionRank("a.mdown"));
    expect(markdownExtensionRank("a.txt")).toBe(4);
  });
});
