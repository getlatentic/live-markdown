import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefCallback } from "react";
import type { EditorView } from "@codemirror/view";

import {
  createMarkdownEditor,
  type MarkdownEditor,
  type MarkdownEditorSettings,
} from "@latentic/live-markdown-core/createMarkdownEditor";

export interface UseMarkdownEditorOptions extends MarkdownEditorSettings<ReactNode> {
  /** The whole markdown file, front matter included. */
  value: string;
  /** Names the document. Each path keeps its own caret, scroll and undo. */
  filePath?: string;
}

export interface UseMarkdownEditor {
  /** Put this on the element the editor mounts in. A callback ref, which
   *  React 18 and 19 type alike. */
  ref: RefCallback<HTMLDivElement>;
  /** The editor, `null` until it has mounted. */
  editor: MarkdownEditor<ReactNode> | null;
  view: EditorView | null;
}

/**
 * The editor in an element of the caller's, for a host that draws its own
 * frame around it. `value` and `filePath` work as in `<CodeMirrorMarkdownEditor>`;
 * the other options are read on every render, so a fresh callback costs nothing.
 */
export function useMarkdownEditor({ value, filePath, ...settings }: UseMarkdownEditorOptions): UseMarkdownEditor {
  // React sets a callback ref before it runs layout effects, so the mount
  // effect below finds the element.
  const parentRef = useRef<HTMLDivElement | null>(null);
  const ref = useCallback(function setParent(element: HTMLDivElement | null) {
    parentRef.current = element;
  }, []);
  const [editor, setEditor] = useState<MarkdownEditor<ReactNode> | null>(null);
  const editorRef = useRef<MarkdownEditor<ReactNode> | null>(null);
  // React can run the mount effect's cleanup and then the effect again on a
  // component that stays mounted (a hidden `<Activity>`, Fast Refresh). Typing
  // not yet emitted crosses that gap here. A real unmount discards the ref.
  const draftRef = useRef<string | null>(null);

  // Ahead of the effects below, which build states from these.
  useLayoutEffect(function passLatestSettings() {
    editorRef.current?.setOptions(settings);
  });

  // Before the paint: a passive effect shows the empty element for one frame
  // and the document the next.
  useLayoutEffect(function mountEditor() {
    const parent = parentRef.current;
    if (!parent) return;
    const mounted = createMarkdownEditor<ReactNode>(parent, { value, filePath, draft: draftRef.current, ...settings });
    draftRef.current = null;
    editorRef.current = mounted;
    setEditor(mounted);
    return function destroyEditor() {
      draftRef.current = mounted.pendingEdit();
      mounted.destroy();
      editorRef.current = null;
      setEditor(null);
    };
    // Once. A new value or path goes through `setDocument`, a mode through
    // `setMode`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    function showDocument() {
      editorRef.current?.setDocument(value, filePath);
    },
    [filePath, value],
  );

  const mode = settings.mode ?? "wysiwyg";
  useEffect(
    function applyMode() {
      editorRef.current?.setMode(mode);
    },
    [mode],
  );

  return { ref, editor, view: editor?.view ?? null };
}
