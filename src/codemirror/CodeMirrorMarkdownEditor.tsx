/**
 * Phase-1 CodeMirror 6 markdown editor — the spike behind the
 * `compose.editorEngine.v1 = "codemirror"` flag.
 *
 * What is wired:
 *   * @codemirror/lang-markdown for tokenization + the small built-in
 *     Markdown keymap (continue-list-on-Enter, etc).
 *   * `markdownDecorationsPlugin` for live-preview headings + bold +
 *     italic. Lists, links, wikilinks, images, comments, tables are
 *     Phase 2+.
 *   * Same `value` / `onChange` contract as `TiptapMarkdownEditor`,
 *     same frontmatter split, same hash-based loop guard. Switching
 *     engines mid-session is safe — the file on disk is unchanged.
 *   * `mode === "source"` disables decorations so the user sees raw
 *     markdown. Same toggle, same shortcut, just no marker-hiding.
 *
 * Deliberately NOT wired in Phase 1 (so this file stays small and
 * the spike actually proves the scaling claim):
 *   * Toolbar formatting buttons (B / I / H1…) — `EditorFileActions`
 *     still renders so Save / History / Export / Comments / Chat
 *     work from the toolbar. Formatting buttons port in Phase 2.
 *   * Image paste / drop, link picker, wikilink rendering, comment
 *     overlay, selection-to-chat bubble. The Tiptap editor handles
 *     these today; the CodeMirror editor will once the spike clears.
 *
 * Public surface mirrors `TiptapMarkdownEditorProps` so AppShell's
 * dispatch is symmetric; Phase-2-or-later callbacks are accepted
 * (and ignored) here rather than guarded at every call site.
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
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

import { parseFrontmatter, serializeMarkdown, type Frontmatter } from "../frontmatter";
import type { DocumentTextChange, SourceRange } from "../types";
import { markdownDecorationsPlugin } from "./decorations/plugin";
import { editorBaseTheme } from "./decorations/editorTheme";
import { cursorModelKeymap } from "./decorations/cursorModel";
import { clickModel } from "./decorations/clickModel";
import { deleteNormalizerKeymap } from "./decorations/deleteNormalizer";
import { tightListKeymap } from "./decorations/listContinuation";
import { formatCommandsKeymap } from "./decorations/formatCommands";
import { blockCommandsKeymap } from "./decorations/blockCommands";
import { imageContextFacet } from "./decorations/imageWidget";
import { imageInsertHandlers } from "./decorations/imageInsertHandlers";
import {
  openExternalUrlFacet,
  resolveImageSrcFacet,
  saveImageBytesFacet,
  sendToAssistantFacet,
  type OpenExternalUrl,
  type ResolveImageSrc,
  type SaveImageBytes,
  type SendToAssistant,
} from "./decorations/hostFacets";
import { computeFileDir, type ImageResolveContext } from "../imageSrcResolver";
import { navigateToFacet } from "./decorations/clickModel";
import { wikilinkFromPathFacet, wikilinkTargetsFacet } from "./decorations/wikilinkPlugin";
import {
  composeExtensions,
  footnoteExtension,
  highlightExtension,
  mathExtension,
  tableExtension,
  wikilinkExtension,
} from "./extensions";

export type CodeMirrorEditorMode = "wysiwyg" | "source";

/** A non-empty editor selection, in document byte offsets. */
export interface EditorSelectionSnapshot {
  range: SourceRange;
  text: string;
}

export interface CodeMirrorMarkdownEditorProps {
  mode?: CodeMirrorEditorMode;
  onChange: (value: string, changes: DocumentTextChange[]) => void;
  value: string;
  workspaceRoot?: string;
  filePath?: string;
  linkTargets?: ReadonlySet<string>;
  onNavigateToLink?: (path: string) => void;
  /**
   * Host-rendered toolbar. The editor owns the live `EditorView` and hands it to
   * the slot; the host builds whatever toolbar UI it wants (formatting buttons,
   * file actions, …) around it. Omit for a chromeless editor. Return a STABLE
   * element shape so the host's own memoisation can hold across keystrokes.
   */
  toolbar?: (ctx: { view: EditorView }) => ReactNode;
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
   * Send a selected table row/column to the host's assistant as a quoted
   * excerpt — wired to the table context menu's "Ask the assistant about this
   * row / column". Default: omitted ⇒ those menu items don't appear.
   */
  onSendToAssistant?: SendToAssistant;
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

const AUTOSAVE_DEBOUNCE_MS = 500;

// Same tiny FNV-1a hash the Tiptap editor uses — dedup of save
// loops only, never used for identity. Kept duplicated rather than
// importing across feature folders; a shared util can land later if
// a third caller appears.
function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16);
}

function CodeMirrorMarkdownEditorInner({
  mode = "wysiwyg",
  onChange,
  value,
  workspaceRoot,
  filePath,
  linkTargets,
  onNavigateToLink,
  toolbar,
  selectionActions,
  resolveImageSrc,
  saveImageBytes,
  onOpenExternalUrl,
  onSendToAssistant,
  onAfterContentSwap,
  onFlushReady,
}: CodeMirrorMarkdownEditorProps) {
  // Frontmatter split — same shape as the Tiptap editor. The
  // editor surface only ever sees the body; YAML is held aside in
  // a ref and recombined on save.
  const parsedRef = useRef(parseFrontmatter(value));
  const frontmatterRef = useRef<Frontmatter | null>(parsedRef.current.frontmatter);
  const bodyRef = useRef<string>(parsedRef.current.body);

  // Loop guard: hash of the last markdown WE emitted. When `value`
  // comes back matching this hash the change is our own echo and
  // we skip the reload (otherwise file watcher → setContent →
  // update → save → file watcher loops).
  const lastEmittedHashRef = useRef<string>(hashString(value));

  // Set by us right before we call `dispatch` from an external
  // value change; the next dispatch-emitted update sees this and
  // skips the save path.
  const suppressNextUpdateRef = useRef<boolean>(false);

  // Debounce timer for autosave.
  const autosaveTimerRef = useRef<number | null>(null);

  // The mount node — given to CM6's `parent` option.
  const hostRef = useRef<HTMLDivElement | null>(null);
  // The live editor instance, held in a ref because React's
  // ref-callback pattern is enough for setup/teardown and we never
  // need a re-render on view changes.
  const viewRef = useRef<EditorView | null>(null);
  // Toolbar needs a re-renderable handle on the view so its pressed-
  // state buttons can subscribe to caret motion. Mirror the ref into
  // state once the view mounts.
  const [viewForToolbar, setViewForToolbar] = useState<EditorView | null>(null);

  // Selection snapshot driving the floating comment bubble. Same
  // shape as the Tiptap editor's `bubbleSelection`. Updated on
  // every selection change (rAF-polled); cleared when selection is
  // empty.
  const [bubbleSelection, setBubbleSelection] = useState<
    { range: SourceRange; text: string } | null
  >(null);

  const onChangeRef = useRef(onChange);
  useLayoutEffect(function syncLatestOnChangeRef() {
    onChangeRef.current = onChange;
  });

  // Host-seam callbacks are read through refs so the facet values (baked into
  // each per-tab EditorState at build time) always call the LATEST prop, never
  // a stale closure — even though the state is rebuilt only on mode/tab change.
  const resolveImageSrcRef = useRef(resolveImageSrc);
  const saveImageBytesRef = useRef(saveImageBytes);
  const openExternalUrlRef = useRef(onOpenExternalUrl);
  const onSendToAssistantRef = useRef(onSendToAssistant);
  const onAfterContentSwapRef = useRef(onAfterContentSwap);
  const onFlushReadyRef = useRef(onFlushReady);
  useLayoutEffect(function syncHostSeamRefs() {
    resolveImageSrcRef.current = resolveImageSrc;
    saveImageBytesRef.current = saveImageBytes;
    openExternalUrlRef.current = onOpenExternalUrl;
    onSendToAssistantRef.current = onSendToAssistant;
    onAfterContentSwapRef.current = onAfterContentSwap;
    onFlushReadyRef.current = onFlushReady;
  });

  // Latest mode kept in a ref so the editor lifecycle effect
  // doesn't tear down and rebuild on a wysiwyg ↔ source toggle.
  // Decorations are added or removed via `Compartment` in the
  // Phase-2 cut; for the spike, we rebuild the view on mode change
  // (rare) but NOT on every keystroke.
  const decorationsEnabled = mode === "wysiwyg";

  // Image src resolution context — passed to the decoration plugin
  // via a CM6 facet so the inline image widget can turn workspace-
  // relative paths into asset:// URLs the webview can fetch.
  const imageCtx = useMemo<ImageResolveContext>(
    () => ({ fileDir: computeFileDir(workspaceRoot, filePath) }),
    [workspaceRoot, filePath],
  );

  // Per-tab EditorState cache. The dominant tab-switch cost on a 1 MB
  // note was CodeMirror re-parsing the whole document on every switch
  // (measured ~140ms p99, see docs/perf-spec.md §5). We keep the live
  // `EditorView` mounted across tab switches and swap its `EditorState`
  // instead — `view.setState(cached)` is a pointer swap, not a re-parse.
  // Switching back to an already-open tab restores its cursor, scroll,
  // and undo history for free.
  //
  // Keyed by file path. `syncedHashRef` records the content hash each
  // cached state reflects so we can tell "the store's value still
  // matches this cached state" (fast restore) from "the file changed
  // under us" (rebuild for correctness).
  const editorStatesRef = useRef<Map<string, EditorState>>(new Map());
  const syncedHashRef = useRef<Map<string, string>>(new Map());
  const currentFileRef = useRef<string | undefined>(filePath);
  // Tracks the decoration mode the live state was built for, so the
  // mode-change effect can skip its initial run (mount already built
  // the correct state).
  const modeInitializedRef = useRef<boolean>(decorationsEnabled);

  // Build the full extension list from the CURRENT props. Called when a
  // tab's state is first created (and on mode change). Each per-file
  // state bakes in that file's path-dependent facets (image dir,
  // wikilink source path), so a restored state stays correct for its
  // own file.
  function buildExtensions(): Extension[] {
    const base: Extension[] = [
      history(),
      // Tight list continuation — Enter drops the next bullet directly below,
      // never with a blank-line gap (overrides the stock markdown Enter for
      // non-empty list items; see listContinuation.ts).
      tightListKeymap,
      keymap.of([...defaultKeymap, ...historyKeymap, ...markdownKeymap]),
      // markdownLanguage = CommonMark + GFM (tables, task lists,
      // strikethrough). Without `base`, `markdown()` uses bare
      // CommonMark — Lezer never produces Table / Task / Strikethrough
      // nodes and our registry can't decorate them.
      //
      // `remove: ["SetextHeading"]` disables setext headings — the rule that a
      // line of text immediately followed by a line of `---` (or `===`) turns
      // the text into a heading. That rule silently rewrites the line ABOVE
      // when you type `-` under a paragraph, which is surprising in a rich
      // editor (and fought our "lone `-` is literal until a space" bullet
      // rule). ATX `#` headings are unaffected.
      markdown({ base: markdownLanguage, extensions: [{ remove: ["SetextHeading"] }] }),
      EditorView.lineWrapping,
      // Editor-internal styling (font, line-height, heading sizes,
      // marker widget styling) lives in `editorBaseTheme` so it
      // participates in CM6's line-metric measurement cycle. Don't
      // duplicate these rules in `global.scss` — that's where the
      // earlier click-drift bug came from.
      editorBaseTheme,
      // Image-src resolution context for the inline image widget.
      imageContextFacet.of(imageCtx),
      // Image paste / drop pipeline. Pulls bytes off the clipboard
      // or DataTransfer, saves through `insertImageBlob`, inserts
      // `![alt](path)` at the caret.
      imageInsertHandlers,
      // Host-environment seams. Registered as stable wrappers (reading the
      // latest prop through a ref) only when the host provides the capability;
      // otherwise the facet's browser default applies. See hostFacets.ts.
      ...(resolveImageSrc
        ? [
            resolveImageSrcFacet.of((rawSrc, ctx) =>
              (resolveImageSrcRef.current ?? ((s: string) => s))(rawSrc, ctx),
            ),
          ]
        : []),
      ...(saveImageBytes
        ? [
            saveImageBytesFacet.of((relPath, bytes) => {
              const fn = saveImageBytesRef.current;
              return fn ? fn(relPath, bytes) : Promise.reject(new Error("no saver"));
            }),
          ]
        : []),
      ...(onOpenExternalUrl
        ? [
            openExternalUrlFacet.of((url) => {
              openExternalUrlRef.current?.(url);
            }),
          ]
        : []),
      ...(onSendToAssistant
        ? [
            sendToAssistantFacet.of((excerpt) => {
              onSendToAssistantRef.current?.(excerpt);
            }),
          ]
        : []),
      // Wikilink resolution facets stay in both modes so Cmd-click
      // can navigate from Raw view too — only the decorating plugin
      // itself is gated by `decorationsEnabled` below.
      wikilinkFromPathFacet.of(filePath),
      wikilinkTargetsFacet.of(linkTargets ?? new Set<string>()),
      ...(onNavigateToLink ? [navigateToFacet.of(onNavigateToLink)] : []),
      // Cursor model: arrow/shift+arrow → next visible source
      // position, skipping hidden markdown syntax in one step.
      cursorModelKeymap,
      // Backspace / Delete: removes visible content; collapses an
      // emptied styled span (no dangling `****`).
      deleteNormalizerKeymap,
      // Cmd+B / Cmd+I / Cmd+E: toggle bold / italic / inline code.
      formatCommandsKeymap,
      // Cmd+1..3 / Cmd+Shift+7..9: heading levels, lists, blockquote.
      blockCommandsKeymap,
      // Click model: Cmd/Ctrl-click on a link opens it; caret
      // placement never lands inside a hidden marker (snap-to-content).
      clickModel,
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        if (suppressNextUpdateRef.current) {
          // The next update after a programmatic dispatch / setState is
          // ours — don't echo a save.
          suppressNextUpdateRef.current = false;
          return;
        }
        if (autosaveTimerRef.current !== null) {
          window.clearTimeout(autosaveTimerRef.current);
        }
        autosaveTimerRef.current = window.setTimeout(() => {
          autosaveTimerRef.current = null;
          const body = update.view.state.doc.toString();
          bodyRef.current = body;
          const full = serializeMarkdown({
            frontmatter: frontmatterRef.current,
            body,
          });
          const hash = hashString(full);
          if (hash === lastEmittedHashRef.current) return;
          lastEmittedHashRef.current = hash;
          if (currentFileRef.current !== undefined) {
            syncedHashRef.current.set(currentFileRef.current, hash);
          }
          onChangeRef.current(full, []);
        }, AUTOSAVE_DEBOUNCE_MS);
      }),
    ];
    if (decorationsEnabled) {
      base.push(markdownDecorationsPlugin);
      const composed = composeExtensions([
        wikilinkExtension,
        highlightExtension,
        footnoteExtension,
        mathExtension,
        tableExtension,
      ]);
      base.push(...composed.extensions);
    }
    return base;
  }
  // `buildExtensions` is intentionally a plain closure read inside
  // effects (not a hook dep) — the effects below decide WHEN a state is
  // rebuilt, so we don't want a fresh `extensions` identity to force a
  // remount the way it did before this cache existed.
  const buildExtensionsRef = useRef(buildExtensions);
  useLayoutEffect(function syncBuildExtensionsRef() {
    buildExtensionsRef.current = buildExtensions;
  });

  // Mount the view ONCE. Subsequent tab switches swap state (below)
  // rather than tearing down — that's the whole point of the cache.
  useEffect(function mountEditorView() {
    const host = hostRef.current;
    if (!host) return;
    const initial = EditorState.create({
      doc: bodyRef.current,
      extensions: buildExtensionsRef.current(),
    });
    if (currentFileRef.current !== undefined) {
      editorStatesRef.current.set(currentFileRef.current, initial);
      syncedHashRef.current.set(currentFileRef.current, lastEmittedHashRef.current);
    }
    const view = new EditorView({ state: initial, parent: host });
    viewRef.current = view;
    setViewForToolbar(view);
    return function teardownEditorView() {
      bodyRef.current = view.state.doc.toString();
      view.destroy();
      viewRef.current = null;
      setViewForToolbar(null);
    };
    // Mount-once: deps intentionally empty. Tab switches go through the
    // sync effect; mode changes through the rebuild effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(function syncEditorToActiveFile() {
    const view = viewRef.current;
    if (!view) return;
    const incomingHash = hashString(value);
    const switchingFile = currentFileRef.current !== filePath;

    if (!switchingFile) {
      // Same file, external value change (LLM write / file watcher) or
      // our own save echo. Patch the live doc in place.
      if (incomingHash === lastEmittedHashRef.current) return;
      const parsed = parseFrontmatter(value);
      frontmatterRef.current = parsed.frontmatter;
      bodyRef.current = parsed.body;
      suppressNextUpdateRef.current = true;
      lastEmittedHashRef.current = incomingHash;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: parsed.body },
      });
      if (filePath !== undefined) syncedHashRef.current.set(filePath, incomingHash);
      return;
    }

    // --- Tab switch ---
    const prev = currentFileRef.current;

    // Flush any pending autosave for the OUTGOING file FIRST. The view
    // now persists across switches, so a stale timer would otherwise
    // fire against the incoming file's state and write the wrong
    // content. We run the save synchronously with the outgoing doc +
    // frontmatter (still current at this point).
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
      const outgoingBody = view.state.doc.toString();
      const outgoingFull = serializeMarkdown({
        frontmatter: frontmatterRef.current,
        body: outgoingBody,
      });
      const outgoingHash = hashString(outgoingFull);
      if (outgoingHash !== lastEmittedHashRef.current) {
        if (prev !== undefined) syncedHashRef.current.set(prev, outgoingHash);
        onChangeRef.current(outgoingFull, []);
      }
    }

    // Stash the outgoing tab's live state (cursor + scroll + undo + any
    // edits) for instant restore later.
    if (prev !== undefined) editorStatesRef.current.set(prev, view.state);

    const parsed = parseFrontmatter(value);
    frontmatterRef.current = parsed.frontmatter;
    bodyRef.current = parsed.body;
    lastEmittedHashRef.current = incomingHash;
    currentFileRef.current = filePath;

    const key = filePath ?? "";
    const cached = editorStatesRef.current.get(key);
    const cachedHash = syncedHashRef.current.get(key);
    suppressNextUpdateRef.current = true;
    if (cached && cachedHash === incomingHash) {
      // FAST PATH — pointer swap, no parse. ~5ms regardless of doc size.
      view.setState(cached);
    } else {
      // Cache miss (first open) or the file changed under us — build a
      // fresh state and cache it.
      const state = EditorState.create({
        doc: parsed.body,
        extensions: buildExtensionsRef.current(),
      });
      editorStatesRef.current.set(key, state);
      syncedHashRef.current.set(key, incomingHash);
      view.setState(state);
    }
    // Content-swap end signal: rAF puts us after CM6's measure +
    // browser paint, so a host's latency probe covers the full "click
    // → new content visible" interval (see docs/perf-spec.md §5).
    requestAnimationFrame(() => onAfterContentSwapRef.current?.());
  }, [filePath, value]);

  // Mode toggle (Rich ↔ Raw) changes the decoration extensions, so
  // every cached state is stale. Rebuild the active file's state from
  // its live doc and drop the cache; other tabs rebuild lazily on next
  // visit. Rare event — not on the hot path.
  useEffect(function rebuildOnModeChange() {
    const view = viewRef.current;
    if (!view) return;
    // Skip the initial run (mount already built the right state).
    if (modeInitializedRef.current === decorationsEnabled) return;
    modeInitializedRef.current = decorationsEnabled;
    const liveBody = view.state.doc.toString();
    editorStatesRef.current.clear();
    syncedHashRef.current.clear();
    suppressNextUpdateRef.current = true;
    const state = EditorState.create({
      doc: liveBody,
      extensions: buildExtensionsRef.current(),
    });
    if (currentFileRef.current !== undefined) {
      editorStatesRef.current.set(currentFileRef.current, state);
      syncedHashRef.current.set(currentFileRef.current, lastEmittedHashRef.current);
    }
    view.setState(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decorationsEnabled]);

  // Pull the live editor content into the store buffer synchronously,
  // cancelling the pending 500ms autosave debounce. The store's save path
  // (`saveActiveFile` — Cmd+S / autosave / close) calls this first so it
  // never persists the stale, debounce-lagged buffer. Reads only refs, so
  // a single stable identity is fine.
  const flushPendingToBuffer = useCallback(function flushPendingToBuffer() {
    const view = viewRef.current;
    if (!view) return;
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const body = view.state.doc.toString();
    bodyRef.current = body;
    const full = serializeMarkdown({ frontmatter: frontmatterRef.current, body });
    const hash = hashString(full);
    if (hash === lastEmittedHashRef.current) return;
    lastEmittedHashRef.current = hash;
    onChangeRef.current(full, []);
  }, []);

  useEffect(function registerFlushBridge() {
    onFlushReadyRef.current?.(flushPendingToBuffer);
    return function unregisterFlushBridge() {
      onFlushReadyRef.current?.(null);
    };
  }, [flushPendingToBuffer]);

  useEffect(function cancelPendingAutosaveOnUnmount() {
    return function clearAutosaveTimer() {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, []);

  useEffect(function pollSelectionForCommentBubble() {
    const view = viewForToolbar;
    if (!view) return;
    let lastFrom = -1;
    let lastTo = -1;
    let raf = 0;
    function poll() {
      const main = view!.state.selection.main;
      if (main.from !== lastFrom || main.to !== lastTo) {
        lastFrom = main.from;
        lastTo = main.to;
        if (main.empty) {
          setBubbleSelection(null);
        } else {
          setBubbleSelection({
            range: { start: main.from, end: main.to },
            text: view!.state.sliceDoc(main.from, main.to),
          });
        }
      }
      raf = requestAnimationFrame(poll);
    }
    raf = requestAnimationFrame(poll);
    return function stopPolling() {
      cancelAnimationFrame(raf);
    };
  }, [viewForToolbar]);

  // Collapse the selection back to a caret — handed to the selection-actions
  // slot so a host can dismiss its bubble after an action lands. Stable (reads
  // the view ref), so it doesn't churn the host's memoised slot.
  const dismissSelection = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const head = view.state.selection.main.head;
    view.dispatch({ selection: EditorSelection.cursor(head) });
  }, []);

  // The toolbar slot is invoked through a memo keyed on the (mount-stable) view
  // and the host's slot identity — NOT on every render. So when a keystroke
  // re-renders this leaf, the toolbar element is referentially unchanged and a
  // memoised host toolbar holds (the perf win we'd otherwise lose by calling
  // the slot inline every render).
  const toolbarNode = useMemo(
    () => (viewForToolbar && toolbar ? toolbar({ view: viewForToolbar }) : null),
    [viewForToolbar, toolbar],
  );
  // The selection slot, by contrast, SHOULD refresh when the selection moves —
  // that's its input. Memoised on the selection so it's stable between
  // selection changes but updates when one happens.
  const selectionNode = useMemo(
    () =>
      selectionActions
        ? selectionActions({ selection: bubbleSelection, dismiss: dismissSelection })
        : null,
    [selectionActions, bubbleSelection, dismissSelection],
  );

  // `cm-editor-host` owns the editor surface layout (toolbar row + scroll area
  // + selection overlay). The toolbar and selection UI are host-rendered slots
  // — the editor stays agnostic about save / export / comments / chat.
  return (
    <div className="tiptap-editor cm-editor-host">
      {toolbarNode}
      <div className="tiptap-editor__scroll cm-editor-host__scroll" ref={hostRef} />
      {selectionNode}
    </div>
  );
}

/**
 * Memoised export — same reason as the Tiptap editor. AppShell
 * re-renders on every chat-thread token; without memoisation each
 * token would blow through the editor's render path.
 */
export const CodeMirrorMarkdownEditor = memo(CodeMirrorMarkdownEditorInner);
