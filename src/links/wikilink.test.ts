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
