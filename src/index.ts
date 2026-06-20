/**
 * ai-editor — a rich markdown editor on CodeMirror 6.
 *
 * Headings, lists, tables, images, math, and footnotes render inline while the
 * file on disk stays plain markdown. `value` in / `onChange` out is always a
 * markdown string — no AST translation, no format lock-in.
 *
 * Host-environment concerns (image storage, asset resolution, link opening,
 * toolbar, selection UI) are injected through props/slots, each with a
 * browser-friendly default, so the editor runs unmodified in a plain browser or
 * a desktop shell.
 */

// ── Editor component ─────────────────────────────────────────────────────────
export {
  CodeMirrorMarkdownEditor,
  type CodeMirrorMarkdownEditorProps,
  type CodeMirrorEditorMode,
  type EditorSelectionSnapshot,
} from "./codemirror/CodeMirrorMarkdownEditor";

// ── Core value types ─────────────────────────────────────────────────────────
export type { SourceRange, DocumentTextChange } from "./types";

// ── Host-environment seam types ──────────────────────────────────────────────
export type {
  ResolveImageSrc,
  SaveImageBytes,
  OpenExternalUrl,
} from "./codemirror/decorations/hostFacets";

// ── Editing commands (for building custom toolbars) ──────────────────────────
export { formatCommands } from "./codemirror/decorations/formatCommands";
export { blockCommands } from "./codemirror/decorations/blockCommands";

// ── Decoration engine + theme ────────────────────────────────────────────────
export { markdownDecorationsPlugin } from "./codemirror/decorations/plugin";
export { editorBaseTheme } from "./codemirror/decorations/editorTheme";
export { type RegistryEntry } from "./codemirror/decorations/registry";

// ── Extension system ─────────────────────────────────────────────────────────
export {
  type MarkdownExtension,
  type ToolbarContribution,
  type CaretContextSnapshot,
  composeExtensions,
  type ComposedExtension,
  highlightExtension,
  footnoteExtension,
  mathExtension,
  tableExtension,
  wikilinkExtension,
} from "./codemirror/extensions";

// ── Image pipeline ───────────────────────────────────────────────────────────
export {
  insertImageBlob,
  buildImageMarkdown,
  extractImageBlobs,
  extractImageFiles,
  type ImageInsertOptions,
  type ImageInsertResult,
} from "./imageInsert";
export {
  imageInsertHandlers,
  pickImageFileForCaret,
} from "./codemirror/decorations/imageInsertHandlers";
export { showImageActionMenu } from "./codemirror/decorations/imageActionMenu";
// The event contract is CodeMirror-free (see imageEditEvent) so a host can
// listen for it without pulling the editor into its initial bundle.
export {
  IMAGE_EDIT_ALT_EVENT,
  type ImageEditAltEventDetail,
} from "./codemirror/decorations/imageEditEvent";
export {
  type ImageResolveContext,
  defaultResolveImageSrc,
  hasUriScheme,
  computeFileDir,
  isAbsolutePath,
  dirnamePath,
  joinPath,
} from "./imageSrcResolver";

// ── Frontmatter ──────────────────────────────────────────────────────────────
export {
  parseFrontmatter,
  serializeMarkdown,
  setFrontmatterField,
  type Frontmatter,
  type FrontmatterValue,
  type MarkdownDocument,
} from "./frontmatter";

// ── Link resolution (wiki + workspace links) ─────────────────────────────────
export {
  parseWikilinkBody,
  resolveWikilinkTarget,
} from "./links/wikilink";
export {
  resolveWorkspaceLink,
  type ResolvedWorkspaceLink,
  type ResolveWorkspaceLinkOptions,
} from "./links/workspaceLink";
