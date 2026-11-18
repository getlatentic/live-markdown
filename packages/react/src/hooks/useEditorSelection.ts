import { useEffect, useState } from "react";
import type { EditorView } from "@codemirror/view";

import {
  watchSelection,
  type EditorSelectionSnapshot,
} from "@latentic/live-markdown-core/codemirror/selectionSnapshot";

/** The selected text and its byte range, or `null` while the selection is a caret. */
export function useEditorSelection(view: EditorView | null): EditorSelectionSnapshot | null {
  const [selection, setSelection] = useState<EditorSelectionSnapshot | null>(null);
  useEffect(
    function trackSelection() {
      if (!view) {
        setSelection(null);
        return;
      }
      return watchSelection(view, setSelection);
    },
    [view],
  );
  return selection;
}
