import { describe, expect, it } from "vitest";
import { resolveWorkspaceLink } from "./workspaceLink";

const known = new Set([
  "index.md",
  "notes/plan.md",
  "notes/sub/deep.md",
  "assets/diagram.png",
  "my note.md",
]);

describe("resolveWorkspaceLink", () => {
  it("resolves a sibling relative link against the source file's dir", () => {
    expect(resolveWorkspaceLink("deep.md", { fromPath: "notes/sub/other.md", knownPaths: known }))
      .toEqual({ kind: "internal", path: "notes/sub/deep.md" });
  });

  it("resolves a parent (../) relative link", () => {
    expect(resolveWorkspaceLink("../plan.md", { fromPath: "notes/sub/deep.md", knownPaths: known }))
      .toEqual({ kind: "internal", path: "notes/plan.md" });
  });

  it("treats a leading / as the vault root, not the filesystem root", () => {
    expect(resolveWorkspaceLink("/notes/plan.md", { fromPath: "index.md", knownPaths: known }))
      .toEqual({ kind: "internal", path: "notes/plan.md" });
  });

  it("resolves root-relative when there is no fromPath (chat replies)", () => {
    expect(resolveWorkspaceLink("notes/plan.md", { knownPaths: known })).toEqual({
      kind: "internal",
      path: "notes/plan.md",
    });
  });

  it("tolerates an extensionless link to a markdown note", () => {
    expect(resolveWorkspaceLink("notes/plan", { knownPaths: known })).toEqual({
      kind: "internal",
      path: "notes/plan.md",
    });
  });

  it("percent-decodes paths and strips query/fragment", () => {
    expect(resolveWorkspaceLink("my%20note.md#section", { knownPaths: known })).toEqual({
      kind: "internal",
      path: "my note.md",
    });
  });

  it("classifies URI-scheme and protocol-relative hrefs as external", () => {
    expect(resolveWorkspaceLink("https://example.com", { knownPaths: known })).toEqual({
      kind: "external",
      href: "https://example.com",
    });
    expect(resolveWorkspaceLink("mailto:a@b.com", { knownPaths: known })).toEqual({
      kind: "external",
      href: "mailto:a@b.com",
    });
    expect(resolveWorkspaceLink("//cdn.example.com/x", { knownPaths: known })?.kind).toBe(
      "external",
    );
  });

  it("returns null for an in-page anchor or empty href", () => {
    expect(resolveWorkspaceLink("#heading", { knownPaths: known })).toBeNull();
    expect(resolveWorkspaceLink("   ", { knownPaths: known })).toBeNull();
  });

  it("returns null for an internal path that matches no known file", () => {
    expect(resolveWorkspaceLink("notes/missing.md", { knownPaths: known })).toBeNull();
  });

  it("never resolves outside the vault root", () => {
    expect(resolveWorkspaceLink("../../etc/passwd", { fromPath: "notes/plan.md", knownPaths: known }))
      .toBeNull();
  });

  it("resolves non-markdown known files too (e.g. images)", () => {
    expect(resolveWorkspaceLink("assets/diagram.png", { knownPaths: known })).toEqual({
      kind: "internal",
      path: "assets/diagram.png",
    });
  });
});
