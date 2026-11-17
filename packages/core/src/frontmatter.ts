/**
 * YAML frontmatter parsing + serialization.
 *
 * Convention: `--- yaml ---` block at the very top of a markdown
 * file (before any other content). Format:
 *
 *   ---
 *   status: draft
 *   tags:
 *     - application
 *     - fellowship
 *   ---
 *
 *   # Real content starts here
 *
 * This module separates the YAML chunk from the prose chunk so
 * the WYSIWYG editor can render only the prose (no raw `key:
 * value` lines bleeding into the user's writing surface) while a
 * separate properties UI shows / edits the frontmatter.
 *
 * Round-trip rules:
 *   - If a file has no frontmatter on disk, we MUST NOT add one
 *     on save just because the properties panel exists.
 *   - If a file has frontmatter, we serialize it using the same
 *     keys/order the user wrote (best effort — yaml lib preserves
 *     scalar formatting but not always blank lines / comments).
 *   - The fence marker is always exactly `---` on its own line.
 *     Some Obsidian users prefer `+++` (TOML) — out of scope for
 *     v1; we round-trip those as body content unchanged.
 */

import { parse, stringify } from "yaml";

/**
 * The frontmatter value type. Each entry is whatever YAML can
 * decode to — strings, numbers, booleans, arrays, nested objects.
 * The properties UI handles primitives + flat arrays cleanly;
 * nested objects fall back to a raw YAML editor.
 */
export type FrontmatterValue = string | number | boolean | null | FrontmatterValue[] | { [key: string]: FrontmatterValue };
export type Frontmatter = Record<string, FrontmatterValue>;

export interface MarkdownDocument {
  /** Parsed YAML key/values. `null` means "no frontmatter block present". */
  frontmatter: Frontmatter | null;
  /** The prose portion — everything after the closing `---`. */
  body: string;
}

/**
 * Regex matches the frontmatter block at the start of a file:
 * a `---` line, then any content (lazy), then a `---` line.
 * Multiline mode + dot-matches-newline. The block must start at
 * the very first character — frontmatter in the middle of a doc
 * doesn't count.
 *
 * Capture groups:
 *   1. The raw YAML body between the fences (no fences included)
 *   2. The optional newline after the closing fence
 */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n)?/;

/**
 * Split a markdown string into its frontmatter + body. Tolerant
 * of:
 *   - No frontmatter at all → `frontmatter: null, body: input`
 *   - Malformed YAML → `frontmatter: null, body: input` (we treat
 *     the whole thing as prose rather than show parse errors)
 *   - Empty frontmatter block (`---\n---`) → `frontmatter: {}`
 */
export function parseFrontmatter(markdown: string): MarkdownDocument {
  const match = markdown.match(FRONTMATTER_RE);
  if (!match) {
    return { frontmatter: null, body: markdown };
  }
  const yamlBody = match[1];
  const afterFence = markdown.slice(match[0].length);
  try {
    const parsed = parse(yamlBody) as unknown;
    // Empty block → empty record; primitive at top level → not
    // a valid frontmatter shape, treat as no frontmatter.
    if (parsed == null) {
      return { frontmatter: {}, body: afterFence };
    }
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
      return { frontmatter: null, body: markdown };
    }
    return { frontmatter: parsed as Frontmatter, body: afterFence };
  } catch {
    // Malformed YAML — surface as plain content. Better to show
    // the raw chars than to drop user-visible bytes silently.
    return { frontmatter: null, body: markdown };
  }
}

/**
 * Recombine frontmatter + body into a markdown string. Inverse
 * of `parseFrontmatter` for legal inputs.
 *
 *   - `frontmatter: null` → just the body, no `---` fences added
 *   - `frontmatter: {}` → no fences either (an empty frontmatter
 *     block is semantically the same as "no frontmatter" and we
 *     prefer the cleaner shape on save)
 *   - Otherwise → `---\n<yaml>\n---\n<body>`
 */
export function serializeMarkdown(doc: MarkdownDocument): string {
  if (doc.frontmatter == null || Object.keys(doc.frontmatter).length === 0) {
    return doc.body;
  }
  const yamlBlock = stringify(doc.frontmatter, {
    // Match the conventional GitHub / Obsidian dialect: 2-space
    // indent for lists, no leading dashes shift, plain string
    // style when possible.
    indent: 2,
    lineWidth: 0,
  }).trimEnd();
  // Exactly one newline between the closing fence and the body.
  // That single newline gets consumed by `FRONTMATTER_RE` on
  // re-parse, so `body` round-trips byte-identical. If the
  // caller wants a blank line between the frontmatter and a
  // heading, they should include the leading `\n` in `body`.
  return `---\n${yamlBlock}\n---\n${doc.body}`;
}

/**
 * Helper: update a single frontmatter field in a markdown string
 * without touching the body. Used by the Properties UI when the
 * user edits one value at a time.
 *
 * If the file had no frontmatter, this adds one with just the
 * one field. If the value is `null` and the key exists, removes
 * the key (and removes the whole frontmatter block if it becomes
 * empty).
 */
export function setFrontmatterField(
  markdown: string,
  key: string,
  value: FrontmatterValue | null,
): string {
  const doc = parseFrontmatter(markdown);
  const current: Frontmatter = doc.frontmatter ?? {};
  if (value === null) {
    delete current[key];
  } else {
    current[key] = value;
  }
  return serializeMarkdown({
    frontmatter: Object.keys(current).length === 0 ? null : current,
    body: doc.body,
  });
}
