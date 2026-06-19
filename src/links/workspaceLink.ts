/**
 * Resolve a markdown link href to a navigation target.
 *
 * A link in a document (or an agent's chat reply) is either:
 *   - **external** — anything with a URI scheme (`https:`, `mailto:`, …) or a
 *     protocol-relative `//host`; opened in the browser, and
 *   - **internal** — a workspace-relative path that resolves to a file the
 *     workspace actually contains; opened in a tab.
 *
 * This is pure path resolution (normalize `.`/`..`, reject escaping the vault
 * root, membership-check against the known files) — it is **not** the index's
 * link parser. The index already resolves links into `graphEdges`; this just
 * decides where a *clicked* href points so the UI can navigate. An href that
 * looks internal but matches no known file returns `null` (a broken link, not
 * something to navigate to).
 */

export type ResolvedWorkspaceLink =
  | { kind: "internal"; path: string }
  | { kind: "external"; href: string };

// A URI scheme (`https:`, `mailto:`, `tel:`, `data:`, …). A workspace-relative
// path never has one.
const URI_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const HAS_EXTENSION = /\.[a-z0-9]+$/i;

export interface ResolveWorkspaceLinkOptions {
  /** Workspace-relative path of the document the link lives in. Relative hrefs
   * resolve against this file's directory. Omitted ⇒ resolve from the vault
   * root (used for agent chat replies, which emit root-relative paths). */
  fromPath?: string;
  /** Every workspace-relative file path, for membership checks. */
  knownPaths: ReadonlySet<string>;
}

export function resolveWorkspaceLink(
  href: string,
  options: ResolveWorkspaceLinkOptions,
): ResolvedWorkspaceLink | null {
  const raw = href.trim();
  if (raw === "" || raw.startsWith("#")) {
    // Empty, or an in-page anchor — not a cross-file link.
    return null;
  }
  if (URI_SCHEME.test(raw) || raw.startsWith("//")) {
    return { kind: "external", href: raw };
  }

  // Workspace path. Drop any ?query / #fragment, then percent-decode.
  const pathPart = decodeSegment(raw.split(/[?#]/, 1)[0] ?? "");
  if (pathPart === "") {
    return null;
  }
  // A leading "/" means "from the vault root", not the filesystem root.
  const base = pathPart.startsWith("/") || !options.fromPath ? "" : dirOf(options.fromPath);
  const normalized = normalizeWorkspacePath(base, pathPart);
  if (normalized === null) {
    // `..` escaped the vault root — never navigate outside it.
    return null;
  }
  if (options.knownPaths.has(normalized)) {
    return { kind: "internal", path: normalized };
  }
  // Tolerate an extensionless link to a markdown note (`notes/plan` → `.md`).
  if (!HAS_EXTENSION.test(normalized) && options.knownPaths.has(`${normalized}.md`)) {
    return { kind: "internal", path: `${normalized}.md` };
  }
  return null;
}

function dirOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Join `base` + `rel`, resolving `.`/`..` segments. Returns `null` if `..`
 * walks above the vault root.
 */
function normalizeWorkspacePath(base: string, rel: string): string | null {
  const parts = base ? base.split("/") : [];
  for (const segment of rel.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (parts.length === 0) {
        return null;
      }
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.join("/");
}
