/**
 * Which paths are Markdown notes — the client-side mirror of the
 * `workspace-index` crate's `markdown_path.rs`. Keep the two in sync.
 */

/** `.md` first: it is the one a link written without an extension means first. */
export const MARKDOWN_EXTENSIONS = ["md", "markdown", "mdown", "mkd"] as const;

/** The Markdown extension a path ends in, as written. A leading dot names a hidden file. */
export function markdownExtension(path: string): string | null {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return null;
  const extension = name.slice(dot + 1);
  const lower = extension.toLowerCase();
  return MARKDOWN_EXTENSIONS.some((known) => known === lower) ? extension : null;
}

/** The path without its Markdown extension; any other path unchanged. */
export function stripMarkdownExtension(path: string): string {
  const extension = markdownExtension(path);
  return extension === null ? path : path.slice(0, -(extension.length + 1));
}

/** Where a path's extension falls in {@link MARKDOWN_EXTENSIONS}; last when it has none. */
export function markdownExtensionRank(path: string): number {
  const lower = markdownExtension(path)?.toLowerCase();
  const rank = MARKDOWN_EXTENSIONS.findIndex((known) => known === lower);
  return rank === -1 ? MARKDOWN_EXTENSIONS.length : rank;
}
