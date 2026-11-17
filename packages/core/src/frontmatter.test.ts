import fc from "fast-check";
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

// Identifier-ish keys (letter-led) keep the test about our fence split/join
// rather than YAML's quoting of exotic or number-like keys.
const keyArb = fc
  .tuple(
    fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")),
    fc.array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789_".split("")), { maxLength: 10 }),
  )
  .map(([head, rest]) => head + rest.join(""));

// Printable values that include YAML-significant chars (`:`, `#`, `-`, spaces)
// so the lib has to make quoting decisions — but no newlines/control, so the
// decoded value is guaranteed to survive stringify → parse.
const scalarStringArb = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz ABCDEF0123456789:#-_.,/".split("")), { maxLength: 24 })
  .map((cs) => cs.join(""));
const scalarArb = fc.oneof(scalarStringArb, fc.integer(), fc.boolean(), fc.constant(null));

// The shapes the Properties UI round-trips cleanly: scalars, flat arrays,
// one-level maps.
const valueArb = fc.oneof(
  scalarArb,
  fc.array(scalarArb, { maxLength: 5 }),
  fc.dictionary(keyArb, scalarArb, { maxKeys: 4 }),
);
const frontmatterArb = fc.dictionary(keyArb, valueArb).filter((fm) => Object.keys(fm).length > 0);

// Bodies may be multi-line and may even contain `---` lines: the serialized
// YAML block never emits a bare `---`, so the first closing fence is always ours.
const bodyArb = fc.array(fc.string(), { maxLength: 6 }).map((lines) => lines.join("\n"));

describe("frontmatter round-trip (property)", () => {
  it("recovers structured frontmatter + body exactly", () => {
    fc.assert(
      fc.property(fc.record({ frontmatter: frontmatterArb, body: bodyArb }), (doc) => {
        const parsed = parseFrontmatter(serializeMarkdown(doc));
        expect(parsed.frontmatter).toEqual(doc.frontmatter);
        expect(parsed.body).toBe(doc.body);
      }),
    );
  });

  it("normalization is idempotent — re-opening a saved file never drifts the bytes", () => {
    const normalize = (markdown: string) => serializeMarkdown(parseFrontmatter(markdown));
    const markdownish = fc.oneof(
      bodyArb, // arbitrary prose — usually no frontmatter at all
      fc.record({ frontmatter: frontmatterArb, body: bodyArb }).map(serializeMarkdown), // real documents
      fc.constantFrom("---\n---\nbody", "---\n\n---\n", "---\nnot: closed\nbody", "+++\ntoml\n+++\n"),
    );
    fc.assert(
      fc.property(markdownish, (markdown) => {
        const once = normalize(markdown);
        expect(normalize(once)).toBe(once);
      }),
    );
  });
});
