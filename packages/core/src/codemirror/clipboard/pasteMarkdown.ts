/**
 * Rich paste (#134): clipboard HTML converts to Markdown at the caret, so a
 * paste from Google Docs / Word / the web keeps headings, emphasis, lists,
 * links, and tables instead of flattening to plain text.
 *
 * Precedence contract:
 *   - image files on the clipboard belong to imageInsertHandlers — skipped;
 *   - Compose's own copies carry {@link COMPOSE_CLIPBOARD_ATTR} — skipped, so
 *     the native path pastes the lossless text/plain markdown;
 *   - Mod-Shift-v pastes verbatim plain text (the escape hatch).
 */

import { EditorView, keymap } from "@codemirror/view";
import { type Extension } from "@codemirror/state";

import { htmlToMarkdown, isComposeClipboardHtml } from "./htmlToMarkdown";

function insertText(view: EditorView, text: string): void {
  view.dispatch(view.state.replaceSelection(text), {
    userEvent: "input.paste",
    scrollIntoView: true,
  });
}

const pasteHandler = EditorView.domEventHandlers({
  paste(event, view) {
    if (event.defaultPrevented) return false;
    const data = event.clipboardData;
    if (!data) return false;
    // Image bytes → the image pipeline, not text conversion.
    if (data.files.length > 0) return false;
    const html = data.getData("text/html");
    if (!html || isComposeClipboardHtml(html)) return false;
    const markdown = htmlToMarkdown(html);
    if (!markdown) return false;
    event.preventDefault();
    insertText(view, markdown);
    return true;
  },
});

const verbatimPasteKeymap = keymap.of([
  {
    key: "Mod-Shift-v",
    run: (view) => {
      // Async clipboard read — allowed here because it rides a user gesture.
      // A denial (or an empty clipboard) quietly does nothing rather than
      // erroring into the document.
      void navigator.clipboard
        .readText()
        .then((text) => {
          if (text) insertText(view, text);
        })
        .catch(() => {});
      return true;
    },
  },
]);

/** The paste half of clipboard interop; compose after imageInsertHandlers. */
export const markdownPaste: Extension = [pasteHandler, verbatimPasteKeymap];
