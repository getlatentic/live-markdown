/**
 * What a document's state is built from, apart from its text: the editing
 * surface, the modules that render markdown, and the host's facts and
 * callbacks as facets. The editor and the paged view build from the same.
 */

import { history } from "@codemirror/commands";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { computeFileDir } from "./imageSrcResolver";
import { drawnCaret } from "./codemirror/caretLayer";
import { renderClipboardHtmlFacet, richCopy, type RenderClipboardHtml } from "./codemirror/clipboard/copyRich";
import { markdownPaste } from "./codemirror/clipboard/pasteMarkdown";
import { codeHighlight, codeLanguageUI } from "./codemirror/code";
import {
  commentOnExcerptFacet,
  editorBaseTheme,
  openExternalUrlFacet,
  parseToEnd,
  resolveImageSrcFacet,
  saveImageBytesFacet,
  type CommentOnExcerpt,
  type OpenExternalUrl,
  type ResolveImageSrc,
  type SaveImageBytes,
} from "./codemirror/core";
import { grammarAndStockKeysWith, lineEditing, visibleTextKeys } from "./codemirror/editingStack";
import {
  footnoteExtension,
  highlightExtension,
  mathExtension,
  mermaidExtension,
  tableExtension,
  wikilinkExtension,
  type MarkdownExtension,
} from "./codemirror/extensions";
import { imageContextFacet, imageInsertHandlers } from "./codemirror/image";
import { clickModel, flankingGuard, navigateToFacet } from "./codemirror/interaction";
import { drawnSelection } from "./codemirror/selectionLayer";
import { updateBus } from "./codemirror/updateBus";
import { wikilinkFromPathFacet, wikilinkTargetsFacet } from "./codemirror/wikilink";

/** What a host tells the editor about a document and its surroundings. */
export interface DocumentSurroundings {
  workspaceRoot?: string;
  linkTargets?: ReadonlySet<string>;
  onNavigateToLink?: (path: string) => void;
}

/** The host's callbacks the editor calls through facets. */
export interface HostCallbacks {
  resolveImageSrc?: ResolveImageSrc;
  saveImageBytes?: SaveImageBytes;
  onOpenExternalUrl?: OpenExternalUrl;
  onCommentOnExcerpt?: CommentOnExcerpt;
  renderClipboardHtml?: RenderClipboardHtml;
}

/** The modules that render markdown. They belong to wysiwyg mode. */
export function builtInModules(): MarkdownExtension[] {
  return [
    wikilinkExtension,
    highlightExtension,
    footnoteExtension,
    mathExtension,
    mermaidExtension,
    tableExtension(),
  ];
}

/** What every document gets, in both modes. */
export function editingSurface(grammar: Parameters<typeof grammarAndStockKeysWith>[0]): Extension[] {
  return [
    history(),
    // The fan-out for a host's reactive chrome. A listener appended to one
    // state dies on the next `setState`, so it rides here.
    updateBus,
    flankingGuard,
    // Drawn from the selection state: the native caret double-paints at widget
    // boundaries, and native selection cannot highlight lines outside the
    // rendered viewport.
    drawnCaret,
    drawnSelection,
    ...lineEditing,
    codeLanguageUI,
    ...grammarAndStockKeysWith(grammar),
    codeHighlight,
    EditorView.lineWrapping,
    // In a theme, not a stylesheet, so the sizes take part in CodeMirror's
    // line measurement.
    editorBaseTheme,
    // Image files first, then rich text to markdown.
    imageInsertHandlers,
    markdownPaste,
    richCopy,
    ...visibleTextKeys,
    clickModel,
    // The syntax tree must cover the whole document, not only what the
    // viewport rendered.
    parseToEnd,
  ];
}

/** Facts about one document, fixed when its state is built. The wikilink
 *  facets stay in source mode so a link can be followed from there too. */
export function documentFacets(settings: DocumentSurroundings, filePath: string | undefined): Extension[] {
  return [
    imageContextFacet.of({ fileDir: computeFileDir(settings.workspaceRoot, filePath) }),
    wikilinkFromPathFacet.of(filePath),
    wikilinkTargetsFacet.of(settings.linkTargets ?? new Set<string>()),
    ...(settings.onNavigateToLink ? [navigateToFacet.of(settings.onNavigateToLink)] : []),
  ];
}

/**
 * The host's callbacks as facets. Each is installed only when the host gave
 * one, so the facet's browser default applies otherwise, and each reads the
 * settings when called, so the latest callback runs.
 */
export function hostSeams(read: () => HostCallbacks): Extension[] {
  const given = read();
  const seams: Extension[] = [
    renderClipboardHtmlFacet.of((markdown) => read().renderClipboardHtml?.(markdown) ?? null),
  ];
  if (given.resolveImageSrc) {
    seams.push(resolveImageSrcFacet.of((src, ctx) => (read().resolveImageSrc ?? ((s: string) => s))(src, ctx)));
  }
  if (given.saveImageBytes) {
    seams.push(
      saveImageBytesFacet.of((relPath, bytes) => {
        const save = read().saveImageBytes;
        return save ? save(relPath, bytes) : Promise.reject(new Error("no saver"));
      }),
    );
  }
  if (given.onOpenExternalUrl) {
    seams.push(openExternalUrlFacet.of((url) => void read().onOpenExternalUrl?.(url)));
  }
  if (given.onCommentOnExcerpt) {
    seams.push(commentOnExcerptFacet.of((excerpt, anchor) => void read().onCommentOnExcerpt?.(excerpt, anchor)));
  }
  return seams;
}
