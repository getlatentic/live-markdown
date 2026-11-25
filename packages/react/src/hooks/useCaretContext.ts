import { useEffect, useState } from "react";
import type { EditorView } from "@codemirror/view";

import {
  EMPTY_CARET_CONTEXT,
  watchCaretContext,
} from "@latentic/live-markdown-core/codemirror/caretContext";
import type { CaretContextSnapshot } from "@latentic/live-markdown-core/codemirror/extensions/types";

/**
 * What the caret sits in, for a toolbar's pressed buttons. Typing inside one
 * paragraph leaves it unchanged, so the caller does not re-render for that.
 */
export function useCaretContext(view: EditorView | null): CaretContextSnapshot {
  const [context, setContext] = useState<CaretContextSnapshot>(EMPTY_CARET_CONTEXT);
  useEffect(
    function trackCaretContext() {
      if (!view) {
        setContext(EMPTY_CARET_CONTEXT);
        return;
      }
      return watchCaretContext(view, setContext);
    },
    [view],
  );
  return context;
}
