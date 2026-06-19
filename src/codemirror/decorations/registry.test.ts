/**
 * Coverage gate for the decoration registry.
 *
 * Asserts that every Lezer markdown node Compose's editor will
 * encounter at runtime has an explicit entry in
 * `MARKDOWN_DECORATION_REGISTRY`. "Explicit" includes `render-raw`
 * and `structural` — the gate's job is not to demand styling for
 * everything, just to make every choice conscious.
 *
 * We read the live parser's node set rather than maintaining a
 * hand-typed canonical list, so the day someone bumps
 * `@lezer/markdown` and it introduces (say) `MathBlock` or
 * `Footnote`, this test trips before that node ships unstyled.
 *
 * Two languages because `markdownLanguage` extends `commonmarkLanguage`
 * with GFM types (Table / Strikethrough / etc) — the editor wires the
 * extended one, so the union is what the user will actually see.
 */

import { commonmarkLanguage, markdownLanguage } from "@codemirror/lang-markdown";
import { describe, expect, it } from "vitest";

import { MARKDOWN_DECORATION_REGISTRY } from "./registry";

// `@codemirror/language`'s `Language.parser` is typed as the abstract
// `Parser` from `@lezer/common`, which doesn't surface `nodeSet`. The
// concrete `MarkdownParser` we get at runtime does. Narrow the public
// type at the boundary rather than importing `MarkdownParser` (which
// would pull `@lezer/markdown` into our direct deps just to satisfy
// the type checker for one test).
interface ParserWithNodeSet {
  readonly nodeSet: { readonly types: readonly { readonly name: string }[] };
}

function collectNodeNames(): Set<string> {
  const names = new Set<string>();
  for (const lang of [commonmarkLanguage, markdownLanguage]) {
    const parser = lang.parser as unknown as ParserWithNodeSet;
    for (const type of parser.nodeSet.types) {
      // Lezer reserves an empty-named type at index 0 for the
      // anonymous root; ignore it. Same for any other anonymous
      // helper types — they're never named in tree iteration.
      if (type.name) names.add(type.name);
    }
  }
  return names;
}

describe("markdown decoration registry", () => {
  it("covers every node Lezer's CommonMark + GFM parsers emit", () => {
    const live = collectNodeNames();
    const missing = [...live].filter((name) => !(name in MARKDOWN_DECORATION_REGISTRY)).sort();
    expect(
      missing,
      // Custom message so the diff actually tells the reader what to do.
      `Add registry entries (kind: "line" | "mark" | "render-raw" | …) for: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("never carries dead entries the live parser no longer emits", () => {
    const live = collectNodeNames();
    const extra = Object.keys(MARKDOWN_DECORATION_REGISTRY)
      .filter((name) => !live.has(name))
      .sort();
    expect(
      extra,
      `Registry has entries for nodes Lezer no longer emits (probably a stale handcoded name): ${extra.join(", ")}`,
    ).toEqual([]);
  });

  it("requires every render-raw / structural entry to carry a `why`", () => {
    const offenders: string[] = [];
    for (const [name, entry] of Object.entries(MARKDOWN_DECORATION_REGISTRY)) {
      if (entry.kind === "render-raw" || entry.kind === "structural") {
        if (!entry.why || entry.why.trim() === "") offenders.push(name);
      }
    }
    expect(
      offenders,
      `These entries omit \`why\` — every "we don't decorate this" decision needs a documented reason: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
