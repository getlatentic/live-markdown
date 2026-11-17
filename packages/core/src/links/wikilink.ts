import {
  MARKDOWN_EXTENSIONS,
  markdownExtension,
  markdownExtensionRank,
  stripMarkdownExtension,
} from "./markdownPath";
import { resolveWorkspaceLink } from "./workspaceLink";

/**
 * Wikilink (`[[target]]` / `[[target|label]]`) parsing + target resolution.
 *
 * The canonical rule lives in the `workspace-index` crate
 * (`wikilink_target_and_label` / `resolve_document_target` / `path_stem_matches`
 * / `slug_key`) — that's what builds the backlink graph. This is the
 * **client-side mirror** used to navigate a *clicked* wikilink, so the editor
 * and chat agree with the sidebar's backlinks. Keep the two in sync; if the
 * crate's rule changes, change it here too.
 *
 * Difference from the crate: an unresolved target returns `null` (we only
 * navigate to files that exist), whereas the crate keeps a would-be path for
 * the graph edge.
 */

/** Split a wikilink body into its target and display label. */
export function parseWikilinkBody(body: string): { target: string; label: string } {
  const pipe = body.indexOf("|");
  const target = (pipe === -1 ? body : body.slice(0, pipe)).trim();
  const rawLabel = pipe === -1 ? target : body.slice(pipe + 1).trim();
  return { target, label: rawLabel === "" ? target : rawLabel };
}

/** Resolve a wikilink target to an existing workspace file path, or `null`. */
export function resolveWikilinkTarget(
  rawTarget: string,
  options: { fromPath?: string; knownPaths: ReadonlySet<string> },
): string | null {
  const target = (rawTarget.split("#", 1)[0] ?? "").trim().replace(/\\/g, "/");
  if (target === "") {
    return null;
  }
  // A target that names its extension means that file; one that doesn't could
  // be a note under any Markdown extension, `.md` first.
  const namedExtension = markdownExtension(target);
  const spellings =
    namedExtension !== null
      ? [target]
      : MARKDOWN_EXTENSIONS.map((extension) => `${target}.${extension}`);

  // Path-like target (`sub/note`, `./note`, `../note`): resolve like a relative
  // link — against the source file's dir first, then the vault root.
  if (target.includes("/") || target.startsWith(".")) {
    for (const spelling of spellings) {
      const relative = resolveWorkspaceLink(spelling, options);
      if (relative?.kind === "internal") {
        return relative.path;
      }
    }
    for (const spelling of spellings) {
      const fromRoot = resolveWorkspaceLink(spelling, { knownPaths: options.knownPaths });
      if (fromRoot?.kind === "internal") {
        return fromRoot.path;
      }
    }
    return null;
  }

  // Bare name: a root-level note, else any note whose stem matches — of two
  // that do, the `.md` one, so the choice never depends on listing order.
  const atRoot = spellings.find((spelling) => options.knownPaths.has(spelling));
  if (atRoot !== undefined) {
    return atRoot;
  }
  const name = stripMarkdownExtension(target);
  const byName = [...options.knownPaths]
    .filter(
      (path) =>
        namedExtension === null ||
        markdownExtension(path)?.toLowerCase() === namedExtension.toLowerCase(),
    )
    .filter((path) => pathStemMatches(path, name))
    .sort((a, b) => markdownExtensionRank(a) - markdownExtensionRank(b) || compareStrings(a, b));
  return byName[0] ?? null;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function pathStemMatches(path: string, target: string): boolean {
  const withoutExtension = stripMarkdownExtension(path);
  const basename = withoutExtension.split("/").pop() ?? withoutExtension;
  const targetLower = target.toLowerCase();
  return (
    withoutExtension.toLowerCase() === targetLower ||
    basename.toLowerCase() === targetLower ||
    slugKey(withoutExtension) === slugKey(target) ||
    slugKey(basename) === slugKey(target)
  );
}

/** Mirror of the crate's `slug_key`: lowercase alphanumerics, collapse
 * ` -_/` to single dashes, drop other punctuation. */
function slugKey(value: string): string {
  let raw = "";
  for (const ch of value) {
    if (/[\p{L}\p{N}]/u.test(ch)) {
      raw += ch.toLowerCase();
    } else if (ch === " " || ch === "-" || ch === "_" || ch === "/") {
      raw += "-";
    }
  }
  return raw.split("-").filter(Boolean).join("-");
}
