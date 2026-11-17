import { describe, expect, it, vi } from "vitest";

import {
  buildImageMarkdown,
  extractImageBlobs,
  extractImageFiles,
  insertImageBlob,
} from "./imageInsert";

function pngBlob(): Blob {
  // Minimal valid PNG header + IEND chunk. The bytes don't need
  // to render — we only test the save path.
  const bytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
    0xae, 0x42, 0x60, 0x82,
  ]);
  return new Blob([bytes], { type: "image/png" });
}

describe("insertImageBlob", () => {
  it("saves via the injected writer and returns the relative path", async () => {
    const saveBytes = vi.fn().mockResolvedValue(undefined);
    const result = await insertImageBlob({
      blob: pngBlob(),
      saveBytes,
    });
    expect(saveBytes).toHaveBeenCalledOnce();
    const [relativePath, bytes] = saveBytes.mock.calls[0];
    expect(relativePath).toMatch(/^images\/pasted-.+\.png$/);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(result.markdownReference).toMatch(/^images\/pasted-.+\.png$/);
    expect(result.alt).toBe("pasted-png");
    expect(result.warning).toBeUndefined();
  });

  it("falls back to a data URL when the injected write fails", async () => {
    const saveBytes = vi.fn().mockRejectedValue(new Error("not available"));
    const result = await insertImageBlob({
      blob: pngBlob(),
      saveBytes,
    });
    expect(result.markdownReference.startsWith("data:image/png")).toBe(true);
    expect(result.warning).toBeDefined();
  });

  it("falls back to a data URL when no writer is injected", async () => {
    const result = await insertImageBlob({ blob: pngBlob() });
    expect(result.markdownReference.startsWith("data:image/png")).toBe(true);
    expect(result.warning).toBeDefined();
  });

  it("uses the caller's alt text when provided", async () => {
    const result = await insertImageBlob({
      blob: pngBlob(),
      saveBytes: vi.fn().mockResolvedValue(undefined),
      alt: "cat looking out the window",
    });
    expect(result.alt).toBe("cat looking out the window");
  });
});

describe("buildImageMarkdown", () => {
  it("produces a markdown image reference with the alt + url", () => {
    expect(
      buildImageMarkdown({
        markdownReference: "images/foo.png",
        alt: "screenshot",
      }),
    ).toBe("![screenshot](images/foo.png)");
  });
});

describe("extractImageBlobs", () => {
  it("returns image items from a DataTransferItemList", () => {
    const blob = pngBlob();
    // Synthesise a minimal DataTransferItemList shape.
    const items = [
      {
        kind: "file",
        type: "image/png",
        getAsFile: () => blob,
      },
      {
        kind: "string",
        type: "text/plain",
        getAsFile: () => null,
      },
    ];
    const list = Object.assign(items, { length: items.length }) as unknown as DataTransferItemList;
    expect(extractImageBlobs(list)).toEqual([blob]);
  });

  it("ignores null inputs", () => {
    expect(extractImageBlobs(null)).toEqual([]);
    expect(extractImageBlobs(undefined)).toEqual([]);
  });
});

describe("extractImageFiles", () => {
  it("filters a FileList to image entries only", () => {
    const png = new File([new Uint8Array(1)], "a.png", { type: "image/png" });
    const txt = new File([new Uint8Array(1)], "b.txt", { type: "text/plain" });
    const list = [png, txt];
    const fileList = Object.assign(list, { length: list.length }) as unknown as FileList;
    expect(extractImageFiles(fileList)).toEqual([png]);
  });
});
