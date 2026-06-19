import { describe, expect, it } from "vitest";
import { parseFrontmatter, serializeMarkdown, setFrontmatterField } from "./frontmatter";

describe("parseFrontmatter", () => {
  it("returns null frontmatter when there's no block", () => {
    const md = "# Just a heading\n\nNo metadata here.";
    expect(parseFrontmatter(md)).toEqual({ frontmatter: null, body: md });
  });

  it("parses a simple key/value block", () => {
    const md = "---\nstatus: draft\ntitle: Test\n---\n# Body\n";
    const result = parseFrontmatter(md);
    expect(result.frontmatter).toEqual({ status: "draft", title: "Test" });
    expect(result.body).toBe("# Body\n");
  });

  it("parses arrays and nested values", () => {
    const md = "---\ntags:\n  - alpha\n  - beta\n---\nbody";
    const result = parseFrontmatter(md);
    expect(result.frontmatter).toEqual({ tags: ["alpha", "beta"] });
    expect(result.body).toBe("body");
  });

  it("treats malformed YAML as plain content (no parse errors leak)", () => {
    // Missing colon — invalid YAML mapping.
    const md = "---\nkey value without colon\n---\nrest";
    const result = parseFrontmatter(md);
    // We accept either "no frontmatter, all body" or "parsed as a
    // single value" — the contract is just "doesn't throw".
    expect(typeof result.body).toBe("string");
  });

  it("treats `---\\n---` as an empty (but present) frontmatter", () => {
    const md = "---\n\n---\nbody";
    const result = parseFrontmatter(md);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe("body");
  });

  it("ignores `---` lines mid-document", () => {
    const md = "# Title\n\n---\n\nThis is just a horizontal rule.";
    const result = parseFrontmatter(md);
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe(md);
  });
});

describe("serializeMarkdown", () => {
  it("omits the fences when frontmatter is null", () => {
    expect(serializeMarkdown({ frontmatter: null, body: "# Hello" })).toBe("# Hello");
  });

  it("omits the fences when frontmatter is empty (cleaner shape on save)", () => {
    expect(serializeMarkdown({ frontmatter: {}, body: "# Hello" })).toBe("# Hello");
  });

  it("writes a fenced block when there are real fields", () => {
    const out = serializeMarkdown({
      frontmatter: { status: "draft", priority: 1 },
      body: "# Body",
    });
    expect(out).toContain("---\n");
    expect(out).toContain("status: draft");
    expect(out).toContain("priority: 1");
    expect(out.endsWith("# Body")).toBe(true);
  });
});

describe("round-trip", () => {
  it("preserves a typical document", () => {
    const md = "---\nstatus: draft\ntags:\n  - a\n  - b\n---\n# Body\n\nText.";
    const parsed = parseFrontmatter(md);
    const reserialized = serializeMarkdown(parsed);
    // Parse the round-trip output and check semantic equality —
    // we don't guarantee byte-identical YAML formatting.
    const reparsed = parseFrontmatter(reserialized);
    expect(reparsed.frontmatter).toEqual(parsed.frontmatter);
    expect(reparsed.body).toBe(parsed.body);
  });
});

describe("setFrontmatterField", () => {
  it("adds a new field to an existing block", () => {
    const md = "---\nstatus: draft\n---\nbody";
    const out = setFrontmatterField(md, "title", "New Title");
    const parsed = parseFrontmatter(out);
    expect(parsed.frontmatter).toEqual({ status: "draft", title: "New Title" });
    expect(parsed.body).toBe("body");
  });

  it("creates a frontmatter block when none existed", () => {
    const md = "# Body";
    const out = setFrontmatterField(md, "title", "Set");
    expect(out).toContain("title: Set");
    expect(out).toContain("# Body");
  });

  it("removes the block entirely when the last field is cleared to null", () => {
    const md = "---\ntitle: To Remove\n---\nbody";
    const out = setFrontmatterField(md, "title", null);
    expect(out).toBe("body");
  });
});
