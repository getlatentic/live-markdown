import { describe, expect, it } from "vitest";

import {
  computeFileDir,
  defaultResolveImageSrc,
  dirnamePath,
  hasUriScheme,
  isAbsolutePath,
  joinPath,
} from "./imageSrcResolver";

describe("path helpers", () => {
  it("joinPath normalizes '.' and '..' segments", () => {
    expect(joinPath("/ws", "images/a.png")).toBe("/ws/images/a.png");
    expect(joinPath("/ws", "./images/a.png")).toBe("/ws/images/a.png");
    expect(joinPath("/ws/sub", "../images/a.png")).toBe("/ws/images/a.png");
    expect(joinPath("/ws/a/b", "../../images/a.png")).toBe("/ws/images/a.png");
  });

  it("joinPath keeps an absolute root and never lets '..' rise above it", () => {
    expect(joinPath("/", "../../etc/passwd")).toBe("/etc/passwd");
  });

  it("dirnamePath returns the parent directory", () => {
    expect(dirnamePath("/ws/sub/note.md")).toBe("/ws/sub");
    expect(dirnamePath("/ws/note.md")).toBe("/ws");
    expect(dirnamePath("/note.md")).toBe("/");
    expect(dirnamePath("note.md")).toBe(".");
  });

  it("isAbsolutePath distinguishes absolute from relative", () => {
    expect(isAbsolutePath("/ws")).toBe(true);
    expect(isAbsolutePath("images/a.png")).toBe(false);
  });
});

describe("computeFileDir", () => {
  it("is null without a workspace root", () => {
    expect(computeFileDir(undefined, "note.md")).toBeNull();
    expect(computeFileDir(null, "note.md")).toBeNull();
  });

  it("falls back to the root when the file path is unknown", () => {
    expect(computeFileDir("/ws", undefined)).toBe("/ws");
  });

  it("is the directory containing the active file", () => {
    expect(computeFileDir("/ws", "note.md")).toBe("/ws");
    expect(computeFileDir("/ws", "sub/note.md")).toBe("/ws/sub");
  });
});

describe("hasUriScheme", () => {
  it("is true for schemed / protocol-relative / fragment refs", () => {
    for (const src of [
      "data:image/png;base64,AAAA",
      "https://example.com/y.png",
      "asset://localhost/x",
      "blob:abc",
      "file:///x.png",
      "//cdn/x.png",
      "#fragment",
    ]) {
      expect(hasUriScheme(src)).toBe(true);
    }
  });

  it("is false for bare workspace-relative paths", () => {
    expect(hasUriScheme("images/a.png")).toBe(false);
    expect(hasUriScheme("/abs/a.png")).toBe(false);
    expect(hasUriScheme("a.png")).toBe(false);
  });
});

describe("defaultResolveImageSrc", () => {
  const ctx = { fileDir: "/ws" };

  it("renders any reference as-is (trimmed)", () => {
    expect(defaultResolveImageSrc("images/a.png", ctx)).toBe("images/a.png");
    expect(defaultResolveImageSrc("  data:image/png;base64,AA  ", ctx)).toBe(
      "data:image/png;base64,AA",
    );
    expect(defaultResolveImageSrc("", ctx)).toBe("");
  });
});
