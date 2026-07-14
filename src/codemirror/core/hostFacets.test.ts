// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { describe, expect, it, vi } from "vitest";

import { defaultResolveImageSrc } from "../../imageSrcResolver";
import { openExternalUrlFacet, resolveImageSrcFacet, saveImageBytesFacet } from "./hostFacets";

describe("hostFacets — defaults and host overrides", () => {
  it("resolveImageSrcFacet defaults to the passthrough resolver", () => {
    const state = EditorState.create({ doc: "" });
    expect(state.facet(resolveImageSrcFacet)).toBe(defaultResolveImageSrc);
  });

  it("resolveImageSrcFacet uses the first registered override", () => {
    const state = EditorState.create({
      doc: "",
      extensions: [resolveImageSrcFacet.of((raw) => `c:${raw}`)],
    });
    expect(state.facet(resolveImageSrcFacet)("img.png", { fileDir: null })).toBe("c:img.png");
  });

  it("saveImageBytesFacet defaults to null (data-URL fallback)", () => {
    const state = EditorState.create({ doc: "" });
    expect(state.facet(saveImageBytesFacet)).toBeNull();
  });

  it("openExternalUrlFacet default opens a new browser tab", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    EditorState.create({ doc: "" }).facet(openExternalUrlFacet)("https://example.com");
    expect(open).toHaveBeenCalledWith("https://example.com", "_blank", "noopener,noreferrer");
    open.mockRestore();
  });
});
