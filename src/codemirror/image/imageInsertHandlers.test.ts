// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { caret, destroyEditors, makeEditor, text } from "../core/editorTestHarness";
import { saveImageBytesFacet } from "../core/hostFacets";
import { insertBlobsAtCaret, pickImageFileForCaret } from "./imageInsertHandlers";

function pngBlob(): Blob {
  return new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
}

describe("insertBlobsAtCaret", () => {
  afterEach(destroyEditors);

  it("saves the blob and inserts a markdown image at the caret", async () => {
    const saved: string[] = [];
    const view = makeEditor("hello ", 6, [
      saveImageBytesFacet.of(async (relPath) => {
        saved.push(relPath);
      }),
    ]);
    await insertBlobsAtCaret(view, [pngBlob()]);

    expect(text(view)).toMatch(/^hello !\[pasted-png\]\(images\/pasted-.*\.png\)\n\n$/);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatch(/^images\/pasted-.*\.png$/);
    expect(caret(view)).toBe(view.state.doc.length);
  });

  it("falls back to an inline data URL when no saveBytes facet is configured", async () => {
    const view = makeEditor("", 0);
    await insertBlobsAtCaret(view, [pngBlob()]);
    expect(text(view)).toMatch(
      /^!\[pasted-png\]\(data:image\/png;base64,[A-Za-z0-9+/=]+\)\n\n$/,
    );
  });
});

describe("pickImageFileForCaret", () => {
  afterEach(destroyEditors);

  it("opens a multi-select image file picker", () => {
    const view = makeEditor("", 0);
    let picker: HTMLInputElement | undefined;
    const clickSpy = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(function mockClick(this: HTMLInputElement) {
        picker = this;
      });
    pickImageFileForCaret(view);
    clickSpy.mockRestore();

    expect(picker?.type).toBe("file");
    expect(picker?.accept).toBe("image/*");
    expect(picker?.multiple).toBe(true);
  });

  it("inserts the picked image files at the caret", async () => {
    const view = makeEditor("", 0);
    let picker: HTMLInputElement | undefined;
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function mockClick(
      this: HTMLInputElement,
    ) {
      picker = this;
    });
    pickImageFileForCaret(view);
    vi.restoreAllMocks();

    const file = new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" });
    Object.defineProperty(picker!, "files", { value: [file], configurable: true });
    picker!.onchange?.(new Event("change"));

    await vi.waitFor(() => {
      expect(text(view)).toMatch(/^!\[pasted-png\]\(data:image\/png;base64,/);
    });
  });
});
