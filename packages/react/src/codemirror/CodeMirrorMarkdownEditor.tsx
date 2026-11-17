/**
 * The editor as a React component: `createMarkdownEditor` from the core,
 * mounted in a `div`, with the toolbar and the selection actions as slots the
 * host renders.
 */

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import type { DocumentTextChange } from "@latentic/live-markdown-core/types";
import type { RenderClipboardHtml } from "@latentic/live-markdown-core/codemirror/clipboard/copyRich";
import {
  watchSelection,
  type EditorSelectionSnapshot,
} from "@latentic/live-markdown-core/codemirror/selectionSnapshot";
import type {
  CommentOnExcerpt,
  OpenExternalUrl,
  ResolveImageSrc,
  SaveImageBytes,
} from "@latentic/live-markdown-core/codemirror/core/index";
import {
  createMarkdownEditor,
  type MarkdownEditor,
  type MarkdownEditorMode,
} from "@latentic/live-markdown-core/createMarkdownEditor";
import { type MarkdownExtension, type ToolbarContribution } from "./extensions";

export type CodeMirrorEditorMode = MarkdownEditorMode;

export type { EditorSelectionSnapshot };

export interface CodeMirrorMarkdownEditorProps {
  mode?: CodeMirrorEditorMode;
  onChange: (value: string, changes: DocumentTextChange[]) => void;
  value: string;
  workspaceRoot?: string;
  filePath?: string;
  linkTargets?: ReadonlySet<string>;
  onNavigateToLink?: (path: string) => void;
  /**
   * Extension modules contributed by the host, merged AFTER the built-ins so a
   * host can deliberately override a construct (the merger warns when a node
   * rule is redefined).
   *
   * Read when an editor state is built — on mount, and on the swaps that
   * rebuild one — not on every render, so passing a fresh array each time costs
   * nothing and cannot remount the editor. Changing it mid-session therefore
   * takes effect at the next rebuild.
   *
   * Applies in BOTH modes: a module's node rules simply go unread while the
   * decoration painter is off, but its keymaps and plain CodeMirror extensions
   * are not markdown-rendering concerns and should not be silently dropped in
   * source mode.
   */
  extensions?: readonly MarkdownExtension[];
  /** Host-rendered toolbar. `contributions` carries the toolbar items the
   *  extension modules asked for; the host decides whether and how to render
   *  them alongside its own. */
  toolbar?: (ctx: {
    view: EditorView;
    contributions: readonly ToolbarContribution[];
  }) => ReactNode;
  /**
   * Host-rendered actions for the current text selection (e.g. a comment / ask
   * bubble). Called with the live selection (or `null` when collapsed) and a
   * `dismiss` that collapses the selection back to a caret. Omit for none.
   */
  selectionActions?: (ctx: {
    selection: EditorSelectionSnapshot | null;
    dismiss: () => void;
  }) => ReactNode;
  // ── Host-environment seams (all optional; browser-friendly defaults) ───────
  /**
   * Map a markdown image `src` to a loadable URL. Default: render the reference
   * as-is. A desktop host maps workspace-relative paths onto its asset protocol.
   */
  resolveImageSrc?: ResolveImageSrc;
  /**
   * Persist a pasted/dropped image's bytes at a workspace-relative path.
   * Default: omitted ⇒ the image is inlined as a `data:` URL.
   */
  saveImageBytes?: SaveImageBytes;
  /**
   * Open a clicked external link. Default: a new browser tab. A desktop host
   * overrides this to leave the app's webview.
   */
  onOpenExternalUrl?: OpenExternalUrl;
  /**
   * Comment on a selected table row/column — wired to the table context menu's
   * "Comment on this row / column". The host opens its comment composer at the
   * given anchor, seeded with the excerpt. Default: omitted ⇒ no such menu items.
   */
  onCommentOnExcerpt?: CommentOnExcerpt;
  /**
   * Render a markdown selection to HTML for the clipboard, so a copy pastes
   * formatted into Google Docs / Slack / Word (the markdown source always
   * rides along as text/plain). Default: omitted ⇒ plain-only copies.
   */
  renderClipboardHtml?: RenderClipboardHtml;
  /**
   * Called once, right after a tab-switch content swap commits and paints.
   * Used by the host for latency instrumentation; no-op by default.
   */
  onAfterContentSwap?: () => void;
  /**
   * Receives a synchronous `flush()` that pulls the editor's live (debounce-
   * lagged) content into the last `onChange` immediately — the host calls it
   * before persisting. `null` is passed on unmount. Lets a host avoid writing
   * stale buffers on Cmd+S / tab close.
   */
  onFlushReady?: (flush: (() => void) | null) => void;
}

function CodeMirrorMarkdownEditorInner({
  mode = "wysiwyg",
  onChange,
  value,
  workspaceRoot,
  filePath,
  linkTargets,
  onNavigateToLink,
  extensions,
  toolbar,
  selectionActions,
  resolveImageSrc,
  saveImageBytes,
  onOpenExternalUrl,
  onCommentOnExcerpt,
  renderClipboardHtml,
  onAfterContentSwap,
  onFlushReady,
}: CodeMirrorMarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<MarkdownEditor<ReactNode> | null>(null);
  // The toolbar and the selection tracking re-run when the view arrives, so
  // the view is state as well as a field of the editor.
  const [view, setView] = useState<EditorView | null>(null);
  const [selection, setSelection] = useState<EditorSelectionSnapshot | null>(null);

  const settings = {
    mode,
    onChange,
    workspaceRoot,
    linkTargets,
    onNavigateToLink,
    extensions,
    resolveImageSrc,
    saveImageBytes,
    onOpenExternalUrl,
    onCommentOnExcerpt,
    renderClipboardHtml,
    onAfterContentSwap,
  };

  // Every render hands the editor the latest props without touching the
  // document, so a fresh callback or `extensions` array costs nothing. Ahead
  // of the effects below, which build states from these.
  useLayoutEffect(function passLatestSettings() {
    editorRef.current?.setOptions(settings);
  });

  // React can run this effect's cleanup and then the effect again on a
  // component that stays mounted (a hidden `<Activity>`, Fast Refresh). Typing
  // not yet emitted crosses that gap here. A real unmount discards the ref.
  const draftRef = useRef<string | null>(null);

  // Before the paint: a passive effect shows the empty host for one frame and
  // the document the next.
  useLayoutEffect(function mountEditor() {
    const host = hostRef.current;
    if (!host) return;
    const editor = createMarkdownEditor<ReactNode>(host, {
      value,
      filePath,
      draft: draftRef.current,
      ...settings,
    });
    draftRef.current = null;
    editorRef.current = editor;
    setView(editor.view);
    return function destroyEditor() {
      draftRef.current = editor.pendingEdit();
      editor.destroy();
      editorRef.current = null;
      setView(null);
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

  useEffect(
    function applyMode() {
      editorRef.current?.setMode(mode);
    },
    [mode],
  );

  const onFlushReadyRef = useRef(onFlushReady);
  useLayoutEffect(function syncOnFlushReadyRef() {
    onFlushReadyRef.current = onFlushReady;
  });
  const flush = useCallback(function flush() {
    editorRef.current?.flush();
  }, []);
  useEffect(
    function registerFlushBridge() {
      onFlushReadyRef.current?.(flush);
      return function unregisterFlushBridge() {
        onFlushReadyRef.current?.(null);
      };
    },
    [flush],
  );

  useEffect(
    function trackSelection() {
      if (view) return watchSelection(view, setSelection);
    },
    [view],
  );

  const dismissSelection = useCallback(function dismissSelection() {
    const live = editorRef.current?.view;
    if (!live) return;
    live.dispatch({ selection: EditorSelection.cursor(live.state.selection.main.head) });
  }, []);

  // Keyed on the view and the slot, not on every render: a keystroke that
  // re-renders this component leaves a memoised host toolbar untouched.
  const toolbarNode = useMemo(
    () =>
      view && toolbar
        ? toolbar({ view, contributions: editorRef.current?.toolbar ?? [] })
        : null,
    [view, toolbar],
  );
  const selectionNode = useMemo(
    () => (selectionActions ? selectionActions({ selection, dismiss: dismissSelection }) : null),
    [selectionActions, selection, dismissSelection],
  );

  return (
    <div className="tiptap-editor cm-editor-host">
      {toolbarNode}
      <div className="tiptap-editor__scroll cm-editor-host__scroll" ref={hostRef} />
      {selectionNode}
    </div>
  );
}

/** Memoised: a host that re-renders often must not re-render the editor. */
export const CodeMirrorMarkdownEditor = memo(CodeMirrorMarkdownEditorInner);
