import { describe, expect, it } from "vitest";
import { parseWikilinkBody, resolveWikilinkTarget } from "./wikilink";

const known = new Set([
  "Plan.md",
  "notes/Daily Note.md",
  "notes/sub/Deep.md",
  "Root Note.md",
]);

describe("parseWikilinkBody", () => {
  it("splits target and label on the first pipe", () => {
    expect(parseWikilinkBody("Plan|the plan")).toEqual({ target: "Plan", label: "the plan" });
    expect(parseWikilinkBody("a|b|c")).toEqual({ target: "a", label: "b|c" });
  });

  it("defaults the label to the target and trims", () => {
    expect(parseWikilinkBody("  Plan  ")).toEqual({ target: "Plan", label: "Plan" });
    expect(parseWikilinkBody("Plan|")).toEqual({ target: "Plan", label: "Plan" });
  });
});

describe("resolveWikilinkTarget", () => {
  it("matches a bare name by file stem (case-insensitive)", () => {
    expect(resolveWikilinkTarget("plan", { knownPaths: known })).toBe("Plan.md");
    expect(resolveWikilinkTarget("Deep", { knownPaths: known })).toBe("notes/sub/Deep.md");
  });

  it("matches a bare name by slug (spaces ↔ separators)", () => {
    expect(resolveWikilinkTarget("daily-note", { knownPaths: known })).toBe("notes/Daily Note.md");
    expect(resolveWikilinkTarget("Daily Note", { knownPaths: known })).toBe("notes/Daily Note.md");
    expect(resolveWikilinkTarget("root_note", { knownPaths: known })).toBe("Root Note.md");
  });

  it("strips an #anchor from the target", () => {
    expect(resolveWikilinkTarget("Plan#section", { knownPaths: known })).toBe("Plan.md");
  });

  it("resolves a path-like target relative to the source, then root", () => {
    expect(resolveWikilinkTarget("sub/Deep", { fromPath: "notes/x.md", knownPaths: known })).toBe(
      "notes/sub/Deep.md",
    );
    expect(resolveWikilinkTarget("notes/sub/Deep", { knownPaths: known })).toBe(
      "notes/sub/Deep.md",
    );
  });

  it("accepts an explicit .md extension", () => {
    expect(resolveWikilinkTarget("Plan.md", { knownPaths: known })).toBe("Plan.md");
  });

  it("returns null for a target that matches no file", () => {
    expect(resolveWikilinkTarget("Nonexistent", { knownPaths: known })).toBeNull();
    expect(resolveWikilinkTarget("", { knownPaths: known })).toBeNull();
  });

  it("never escapes the vault root via a path-like target", () => {
    expect(
      resolveWikilinkTarget("../../etc/passwd", { fromPath: "notes/x.md", knownPaths: known }),
    ).toBeNull();
  });
});

describe("resolveWikilinkTarget across Markdown extensions", () => {
  const mixed = new Set([
    "notes/source.md",
    "research/plan.markdown",
    "notes/sub/Deep.mkd",
    "notes/Loud.MD",
    "notes/twin.mdown",
    "notes/twin.md",
  ]);

  it("finds a note saved under another Markdown extension by name", () => {
    expect(resolveWikilinkTarget("plan", { knownPaths: mixed })).toBe("research/plan.markdown");
  });

  it("finds one by a relative path written without an extension", () => {
    expect(
      resolveWikilinkTarget("sub/Deep", { fromPath: "notes/source.md", knownPaths: mixed }),
    ).toBe("notes/sub/Deep.mkd");
  });

  it("matches a name whatever the case of the note's extension", () => {
    expect(resolveWikilinkTarget("loud", { knownPaths: mixed })).toBe("notes/Loud.MD");
  });

  it("takes a named extension at its word", () => {
    expect(resolveWikilinkTarget("twin.mdown", { knownPaths: mixed })).toBe("notes/twin.mdown");
  });

  it("chooses the .md note when two answer to the same name, whatever order they are listed in", () => {
    expect(resolveWikilinkTarget("twin", { knownPaths: mixed })).toBe("notes/twin.md");
  });

  it("does not take a text file for a note", () => {
    expect(resolveWikilinkTarget("todo", { knownPaths: new Set(["todo.txt"]) })).toBeNull();
  });
});
