// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "./editorTestHarness";
import { resolveImageSrcFacet } from "./hostFacets";
import { ImageWidget } from "./imageWidget";

const ctx = { fileDir: null };

describe("ImageWidget", () => {
  afterEach(() => {
    document.querySelectorAll(".cm-image-menu").forEach((m) => m.remove());
    destroyEditors();
  });

  it("renders an <img> with alt, lazy loading, and a facet-resolved src", () => {
    const view = makeEditor("x", 0, [resolveImageSrcFacet.of((raw) => `resolved:${raw}`)]);
    const dom = new ImageWidget("a picture", "images/x.png", ctx, 0, 5).toDOM(
      view,
    ) as HTMLImageElement;
    expect(dom.tagName).toBe("IMG");
    expect(dom.className).toBe("cm-image-widget");
    expect(dom.alt).toBe("a picture");
    expect(dom.loading).toBe("lazy");
    expect(dom.getAttribute("src")).toBe("resolved:images/x.png");
  });

  it("opens the image action menu on right-click", () => {
    const view = makeEditor("x", 0);
    const dom = new ImageWidget("a", "images/x.png", ctx, 0, 5).toDOM(view);
    dom.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    expect(document.querySelector(".cm-image-menu")).not.toBeNull();
  });

  it("eq() compares alt, rawSrc, fileDir, and sourceFrom (not sourceTo)", () => {
    const base = new ImageWidget("a", "s", ctx, 0, 5);
    expect(base.eq(new ImageWidget("a", "s", ctx, 0, 99))).toBe(true);
    expect(base.eq(new ImageWidget("b", "s", ctx, 0, 5))).toBe(false);
    expect(base.eq(new ImageWidget("a", "t", ctx, 0, 5))).toBe(false);
    expect(base.eq(new ImageWidget("a", "s", ctx, 1, 5))).toBe(false);
    expect(base.eq(new ImageWidget("a", "s", { fileDir: "sub" }, 0, 5))).toBe(false);
  });
});
