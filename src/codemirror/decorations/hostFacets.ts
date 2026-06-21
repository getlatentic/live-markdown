/**
 * Host-environment injection seams.
 *
 * The editor surface is environment-agnostic: it knows how to render and edit
 * markdown, but NOT how to read/write files, resolve asset URLs, or open links —
 * those depend on where it's embedded (a Tauri desktop shell, a plain browser, a
 * server-rendered preview). Each capability is a CM6 facet with a sensible
 * browser default; the React host overrides it by setting the facet from a prop.
 *
 * Keeping these as facets (not React context) lets the non-React CM6 plugins and
 * widgets — image paste handlers, the inline `<img>` widget, the click model —
 * read them straight off `view.state`.
 */

import { Facet } from "@codemirror/state";

import { defaultResolveImageSrc, type ImageResolveContext } from "../../imageSrcResolver";
import { type SourceRange } from "../../types";

export type ResolveImageSrc = (rawSrc: string, ctx: ImageResolveContext) => string;
export type SaveImageBytes = (relPath: string, bytes: Uint8Array) => Promise<void>;
export type OpenExternalUrl = (url: string) => void;
export type SendToAssistant = (excerpt: { text: string; range: SourceRange }) => void;

/**
 * Turn a markdown image `src` into a URL the view can load. Default: pass the
 * reference through unchanged (data URLs and absolute URLs render directly; a
 * browser resolves relative refs against the page origin). A desktop host
 * overrides this to map workspace-relative paths onto its asset protocol.
 */
export const resolveImageSrcFacet = Facet.define<ResolveImageSrc, ResolveImageSrc>({
  combine: (values) => values[0] ?? defaultResolveImageSrc,
});

/**
 * Persist pasted/dropped image bytes at a workspace-relative path. Default:
 * `null` — the insert pipeline then inlines the image as a `data:` URL so it
 * still survives a reload. A desktop host provides a writer that saves to disk
 * and the markdown reference stays a portable relative path.
 */
export const saveImageBytesFacet = Facet.define<SaveImageBytes | null, SaveImageBytes | null>({
  combine: (values) => values[0] ?? null,
});

/**
 * Open a clicked external link. Default: a new browser tab. A desktop host
 * overrides this to leave the app's webview via its shell-open API.
 */
export const openExternalUrlFacet = Facet.define<OpenExternalUrl, OpenExternalUrl>({
  combine: (values) => values[0] ?? defaultOpenExternalUrl,
});

/**
 * Hand a selected table row/column to the host's assistant as a quoted excerpt.
 * Default: `null` — the table context menu then omits its "Ask the assistant"
 * items. A desktop host wires this to its chat panel (open chat, take a question,
 * stream a reply about the excerpt).
 */
export const sendToAssistantFacet = Facet.define<SendToAssistant | null, SendToAssistant | null>({
  combine: (values) => values[0] ?? null,
});

function defaultOpenExternalUrl(url: string): void {
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
