/**
 * Display-time resolution of image `src` values for the editor — the
 * environment-agnostic pieces.
 *
 * Markdown stores image references **workspace-relative and portable** (e.g.
 * `images/pasted-….png`), which is what lands on disk and survives moving the
 * folder between machines. A WebView, though, can't load a bare relative path
 * against its app origin, so a host that streams local files needs to map the
 * reference onto its own asset protocol.
 *
 * This module provides the host-independent parts: the POSIX path helpers
 * (`computeFileDir` / `joinPath` / …), the `hasUriScheme` guard, and
 * `defaultResolveImageSrc` (render as-is — the browser/SSR default). A desktop
 * host composes these with its file API (e.g. Tauri `convertFileSrc`) to build
 * its own resolver and injects it via the editor's `resolveImageSrc` prop. The
 * stored markdown reference is never rewritten — only the rendered `<img src>`.
 *
 * Paths are treated as POSIX (`/`), matching the macOS/Linux workspace folders
 * this targets. Windows-style drive paths are passed through unresolved.
 */
export interface ImageResolveContext {
  /** Absolute OS directory of the markdown file being edited, or null. */
  fileDir: string | null;
}

// Anything that already carries a scheme (`data:`, `http(s):`, `asset:`,
// `blob:`, `file:`, `tauri:`, `mailto:` …), a protocol-relative `//`, or a bare
// fragment `#` is "already resolvable" — no path resolution applies.
const HAS_SCHEME = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

/**
 * True when `src` already carries a URI scheme, a protocol-relative `//`, or a
 * bare fragment — i.e. it's directly loadable and needs no path resolution. A
 * host's display-src resolver uses this to decide whether to map a relative
 * workspace path onto its own asset protocol.
 */
export function hasUriScheme(src: string): boolean {
  return HAS_SCHEME.test(src.trim());
}

/**
 * Environment-agnostic default for the editor's `resolveImageSrcFacet`: render
 * the reference as-is. Data URLs and absolute/schemed URLs load directly; a
 * relative ref resolves against the page origin (or shows broken if no backing
 * file). A desktop host overrides the facet with its own resolver, which maps
 * relative paths onto a local asset protocol.
 */
export function defaultResolveImageSrc(rawSrc: string, _ctx: ImageResolveContext): string {
  return rawSrc.trim();
}

/**
 * The directory a relative image reference resolves against: the folder
 * containing the active markdown file. Falls back to the workspace root when
 * the file path is unknown, and to null when there's no workspace.
 */
export function computeFileDir(
  workspaceRoot: string | null | undefined,
  filePath: string | null | undefined,
): string | null {
  if (!workspaceRoot) return null;
  if (!filePath) return workspaceRoot;
  return dirnamePath(joinPath(workspaceRoot, filePath));
}

export function isAbsolutePath(p: string): boolean {
  return p.startsWith("/");
}

/** POSIX `dirname`: the parent of a path, with trailing slashes ignored. */
export function dirnamePath(p: string): string {
  const trimmed = p.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  if (idx < 0) return ".";
  if (idx === 0) return "/";
  return trimmed.slice(0, idx);
}

/**
 * Join `rel` onto `dir`, normalizing `.` and `..` segments. Absolute-ness is
 * inherited from `dir`; `..` never escapes above an absolute root.
 */
export function joinPath(dir: string, rel: string): string {
  const isAbs = isAbsolutePath(dir);
  const out: string[] = [];
  for (const part of `${dir}/${rel}`.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length && out[out.length - 1] !== "..") {
        out.pop();
      } else if (!isAbs) {
        out.push("..");
      }
      continue;
    }
    out.push(part);
  }
  return (isAbs ? "/" : "") + out.join("/");
}
