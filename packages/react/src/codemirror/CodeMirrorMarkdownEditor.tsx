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
  type ReactNode,
} from "react";
import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import type { DocumentTextChange } from "@latentic/live-markdown-core/types";
import type { RenderClipboardHtml } from "@latentic/live-markdown-core/codemirror/clipboard/copyRich";
import type { EditorSelectionSnapshot } from "@latentic/live-markdown-core/codemirror/selectionSnapshot";
import type {
  CommentOnExcerpt,
  OpenExternalUrl,
  ResolveImageSrc,
  SaveImageBytes,
} from "@latentic/live-markdown-core/codemirror/core/index";
import type { MarkdownEditor, MarkdownEditorMode } from "@latentic/live-markdown-core/createMarkdownEditor";
import { useEditorSelection } from "../hooks/useEditorSelection";
import { useMarkdownEditor } from "../hooks/useMarkdownEditor";
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
  toolbar,
  selectionActions,
  onFlushReady,
  ...options
}: CodeMirrorMarkdownEditorProps) {
  const { ref, editor, view } = useMarkdownEditor(options);
  useFlushBridge(editor, onFlushReady);
  const selection = useEditorSelection(view);

  const dismissSelection = useCallback(
    function dismissSelection() {
      view?.dispatch({ selection: EditorSelection.cursor(view.state.selection.main.head) });
    },
    [view],
  );

  // Keyed on the view and the slot, not on every render: a keystroke that
  // re-renders this component leaves a memoised host toolbar untouched.
  const toolbarNode = useMemo(
    () => (view && toolbar ? toolbar({ view, contributions: editor?.toolbar ?? [] }) : null),
    [view, editor, toolbar],
  );
  const selectionNode = useMemo(
    () => (selectionActions ? selectionActions({ selection, dismiss: dismissSelection }) : null),
    [selectionActions, selection, dismissSelection],
  );

  return (
    <div className="tiptap-editor cm-editor-host">
      {toolbarNode}
      <div className="tiptap-editor__scroll cm-editor-host__scroll" ref={ref} />
      {selectionNode}
    </div>
  );
}

/** Hands the host a stable `flush`, and `null` once the editor is gone. */
function useFlushBridge(
  editor: MarkdownEditor<ReactNode> | null,
  onFlushReady: CodeMirrorMarkdownEditorProps["onFlushReady"],
): void {
  const onFlushReadyRef = useRef(onFlushReady);
  useLayoutEffect(function syncOnFlushReadyRef() {
    onFlushReadyRef.current = onFlushReady;
  });
  useEffect(
    function registerFlushBridge() {
      if (!editor) return;
      onFlushReadyRef.current?.(() => editor.flush());
      return function unregisterFlushBridge() {
        onFlushReadyRef.current?.(null);
      };
    },
    [editor],
  );
}

/** Memoised: a host that re-renders often must not re-render the editor. */
export const CodeMirrorMarkdownEditor = memo(CodeMirrorMarkdownEditorInner);
