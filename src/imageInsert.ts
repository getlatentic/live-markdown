/**
 * Image-insertion pipeline. Used by both paste-from-clipboard and
 * drag-and-drop. Both produce a `Blob`; this module turns the blob
 * into a markdown-reference-able path:
 *
 *   * When a `saveBytes` writer is injected (a desktop host): writes
 *     the bytes to `images/<timestamp>-<hash>.<ext>` and returns the
 *     relative path. The markdown reference is portable across
 *     machines because it's a real on-disk file.
 *   * Otherwise (plain browser, or the write fails): falls back to a
 *     data URL embedded directly in the markdown. The markdown file
 *     bloats but the image stays visible through page reload without
 *     needing a binary file API.
 *
 * The writer is injected rather than imported so this module stays
 * environment-agnostic — the editor reads it off a CM6 facet
 * ({@link saveImageBytesFacet}) the host wires up.
 *
 * Returned `markdownReference` is what the caller drops into
 * `![alt](…)`. `warning` is set in the data-URL fallback case so
 * the caller can surface a note to the user.
 */
export interface ImageInsertOptions {
  blob: Blob;
  /**
   * Persist the bytes at a workspace-relative path. `null`/omitted ⇒
   * inline as a data URL (browser fallback).
   */
  saveBytes?: ((relPath: string, bytes: Uint8Array) => Promise<void>) | null;
  /**
   * Alt text the user typed (currently always synthesized as
   * "pasted-image" or "dropped-image"; in phase 3d the inline
   * rename UI lets the user edit it post-insert).
   */
  alt?: string;
}

export interface ImageInsertResult {
  markdownReference: string;
  alt: string;
  warning?: string;
}

/**
 * Save the blob and return the markdown reference. Errors are
 * structured (the caller decides whether to retry with a fallback
 * or surface a notification).
 */
export async function insertImageBlob(opts: ImageInsertOptions): Promise<ImageInsertResult> {
  const alt = opts.alt ?? defaultAltFromMime(opts.blob.type);
  const filename = buildImageFilename(opts.blob.type);

  // Try the on-disk pipeline first. Falls back to a data URL when no
  // writer is injected (plain browser) or the write fails for a
  // recoverable reason.
  if (opts.saveBytes) {
    try {
      const bytes = new Uint8Array(await opts.blob.arrayBuffer());
      await opts.saveBytes(`images/${filename}`, bytes);
      return {
        markdownReference: `images/${filename}`,
        alt,
      };
    } catch (error) {
      return {
        markdownReference: await blobToDataUrl(opts.blob),
        alt,
        warning:
          error instanceof Error
            ? `Saved as inline data URL: ${error.message}`
            : "Saved as inline data URL — workspace write unavailable",
      };
    }
  }

  return {
    markdownReference: await blobToDataUrl(opts.blob),
    alt,
    warning: "Saved as inline data URL — no file storage configured",
  };
}

/**
 * Build a markdown image insertion string from the result. Keeps
 * the call site (handlePaste / handleDrop) tidy.
 */
export function buildImageMarkdown(result: ImageInsertResult): string {
  return `![${result.alt}](${result.markdownReference})`;
}

/**
 * Scan a DataTransferItemList for image blobs. Returns every
 * image found, in order. Empty array when nothing matches —
 * caller treats that as "fall through to text paste".
 */
export function extractImageBlobs(items: DataTransferItemList | null | undefined): Blob[] {
  if (!items) return [];
  const blobs: Blob[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const blob = item.getAsFile();
      if (blob) {
        blobs.push(blob);
      }
    }
  }
  return blobs;
}

/**
 * Scan a FileList (drag-and-drop's `dataTransfer.files`) for
 * image files. Drag-drop and paste use different shapes; this
 * keeps the two paths symmetrical at the call site.
 */
export function extractImageFiles(files: FileList | null | undefined): File[] {
  if (!files) return [];
  const out: File[] = [];
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    if (file.type.startsWith("image/")) {
      out.push(file);
    }
  }
  return out;
}

function defaultAltFromMime(mime: string): string {
  const sub = mime.split("/")[1] ?? "image";
  return `pasted-${sub}`;
}

function buildImageFilename(mime: string): string {
  const ext = extensionForMime(mime);
  // Timestamp first so files sort chronologically; short suffix
  // disambiguates within-tick collisions (multi-image drops).
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `pasted-${ts}-${suffix}.${ext}`;
}

function extensionForMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    case "image/bmp":
      return "bmp";
    default:
      return "bin";
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  // Built-in `FileReader.readAsDataURL` is the conventional path
  // but it isn't available in node test environments. Building
  // the data URL by hand from the byte buffer keeps the helper
  // testable AND avoids an extra async hop in production.
  const buffer = new Uint8Array(await blob.arrayBuffer());
  const base64 = bytesToBase64(buffer);
  const mime = blob.type || "application/octet-stream";
  return `data:${mime};base64,${base64}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  // Browser path — `btoa` over the string built from char codes.
  if (typeof btoa === "function") {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      // String.fromCharCode handles small slices; chunking
      // avoids the "Maximum call stack size exceeded" issue with
      // the spread operator on multi-MB images.
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }
  // Node path — Buffer is available in vitest's node environment.
  // We use `globalThis` to avoid pulling in a Node type
  // declaration on the browser side.
  const buffer = (globalThis as unknown as { Buffer?: { from: (b: Uint8Array) => { toString: (enc: string) => string } } }).Buffer;
  if (buffer && typeof buffer.from === "function") {
    return buffer.from(bytes).toString("base64");
  }
  throw new Error("No base64 encoder available in this environment");
}
