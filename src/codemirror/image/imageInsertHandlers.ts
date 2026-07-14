/**
 * Image insertion handlers for CM6 — paste image bytes from the
 * clipboard or drop image files into the editor, save them through
 * the existing `insertImageBlob` pipeline, then insert the
 * resulting `![alt](path)` markdown at the caret.
 *
 * Same pipeline the Tiptap editor uses; the editor surface differs
 * but the persistence + markdown-reference logic is shared.
 */

import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import {
  buildImageMarkdown,
  extractImageBlobs,
  extractImageFiles,
  insertImageBlob,
} from "../../imageInsert";
import { saveImageBytesFacet } from "../core/hostFacets";

export async function insertBlobsAtCaret(view: EditorView, blobs: Blob[]): Promise<void> {
  const saveBytes = view.state.facet(saveImageBytesFacet);
  for (const blob of blobs) {
    try {
      const result = await insertImageBlob({ blob, saveBytes });
      const md = buildImageMarkdown(result);
      const pos = view.state.selection.main.head;
      const insert = md + "\n\n";
      view.dispatch({
        changes: { from: pos, insert },
        selection: EditorSelection.cursor(pos + insert.length),
        userEvent: "input.paste.image",
      });
      if (result.warning) {
        // Browser-dev fallback to data URL — surface via console so
        // the user knows the markdown bloated.
        // eslint-disable-next-line no-console
        console.info(`Image inserted with fallback: ${result.warning}`);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to insert image:", error);
    }
  }
}

export const imageInsertHandlers = EditorView.domEventHandlers({
  paste(event, view) {
    const blobs = extractImageBlobs(event.clipboardData?.items);
    if (blobs.length === 0) return false;
    event.preventDefault();
    void insertBlobsAtCaret(view, blobs);
    return true;
  },
  drop(event, view) {
    const files = extractImageFiles(event.dataTransfer?.files);
    if (files.length === 0) return false;
    event.preventDefault();
    void insertBlobsAtCaret(view, files);
    return true;
  },
});

/**
 * Open the browser's native file picker, then run the picked files
 * through the same insert pipeline. Called by the toolbar's Image
 * button.
 */
export function pickImageFileForCaret(view: EditorView): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;
  input.onchange = () => {
    const files = input.files ? Array.from(input.files) : [];
    if (files.length > 0) void insertBlobsAtCaret(view, files);
  };
  input.click();
}
