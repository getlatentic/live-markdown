/**
 * Canonical map: every Lezer markdown node name → how Compose
 * decorates it. The Lezer parser handles CommonMark + GFM spec
 * compliance for us; this file is the *visual* contract.
 *
 * Why this exists as data, not an `if`/`else` chain in the builder:
 *
 *   1. **Completeness is auditable.** `registry.test.ts` reads
 *      `commonmarkLanguage.parser.nodeSet.types` at test time and
 *      fails when any node Lezer emits isn't represented here. A
 *      new GFM extension, a new lezer-markdown release that adds a
 *      node — the gate trips before it ships unstyled.
 *   2. **Every choice is explicit.** `render-raw` is a real kind
 *      with a `why:`, not an omission. Reading the registry tells
 *      you exactly what the editor *intends* to do per construct,
 *      and the reason it doesn't yet style something is right
 *      there alongside the entry.
 *   3. **Adding a decoration is a one-line registry change**, not
 *      a one-arm-in-the-builder change.
 *
 * Coverage levels (the `kind` discriminant):
 *
 *   - `heading-line` — `Decoration.line` sized per heading level.
 *     The composite case: also pairs with the heading's
 *     `HeaderMark` (which is its own `hide-always` entry below).
 *   - `line` — `Decoration.line` stamped on every line the node
 *     spans. Used for block-level styling (blockquote, fenced code,
 *     list item).
 *   - `mark` — `Decoration.mark` applied to the span. Used for
 *     inline styling (bold, italic, inline code, link).
 *   - `structural` — Lezer emits this for grouping; it is never
 *     directly user-visible (e.g. `Document`, `BulletList`
 *     containers — children carry the actual styling).
 *   - `render-raw` — visible to the user but deliberately
 *     unstyled-for-now. Carries a `why:` documenting Phase 2+
 *     intent. The coverage test will *not* let you leave this
 *     blank — explicit is the point.
 */

export type RegistryEntry =
  | { readonly kind: "heading-line"; readonly level: 1 | 2 | 3 | 4 | 5 | 6; readonly className: string }
  | { readonly kind: "line"; readonly className: string }
  | { readonly kind: "mark"; readonly className: string }
  /**
   * Fully hide the marker forever — no reveal on cursor proximity.
   * Compose hides every syntax marker (`#`, `**`, backticks, `[`/`]`,
   * `>`) this way: a deliberate non-technical-UX choice, distinct
   * from Obsidian's Live Preview where markers reappear near the
   * cursor. Hidden ranges are skipped atomically by cursor motion.
   */
  | { readonly kind: "hide-always" }
  /**
   * Hide the syntax marker and inject a DOM widget in its place.
   * Used for `ListMark` → bullet today; the same shape will carry
   * task-list checkboxes, language-tag chips for fenced code, etc.
   * Widget instances are tagged by `widget` so the plugin can pick
   * which `WidgetType` to construct (a typed dispatch keeps the
   * registry serialisable and the test exhaustive).
   *
   * `WidgetType` instances participate in CM6's line measurement —
   * that's what distinguishes this from a CSS `::before` and why
   * clicks on the widget land in the right document position.
   */
  | {
      readonly kind: "hide-with-widget";
      readonly widget:
        | "bullet"
        | "task-checkbox"
        | "image"
        | "hr"
        | "cell-divider"
        | "html-inline"
        | "html-block";
    }
  | { readonly kind: "structural"; readonly why: string }
  | { readonly kind: "render-raw"; readonly why: string }
  /**
   * Hide only the leading backslash of an escape (`\x`), leaving the
   * escaped character — so `\'` renders as `'`, per CommonMark, rather
   * than showing a literal backslash.
   */
  | { readonly kind: "escape" };

/**
 * The full registry. Order is grouped by spec section for readability;
 * runtime lookup is by name, so ordering is purely human-facing.
 *
 * If you add a Lezer extension that introduces new node names (a GFM
 * variant, a custom block parser), add the entries here. The coverage
 * test will fail-loud if you don't.
 */
export const MARKDOWN_DECORATION_REGISTRY: Readonly<Record<string, RegistryEntry>> = {
  // ----- Structural wrappers (never directly styled) -----
  Document: { kind: "structural", why: "top-level wrapper" },
  Paragraph: { kind: "structural", why: "body font is the default" },

  // ----- ATX headings (`# H1` … `###### H6`) -----
  ATXHeading1: { kind: "heading-line", level: 1, className: "cm-heading cm-heading--1" },
  ATXHeading2: { kind: "heading-line", level: 2, className: "cm-heading cm-heading--2" },
  ATXHeading3: { kind: "heading-line", level: 3, className: "cm-heading cm-heading--3" },
  ATXHeading4: { kind: "heading-line", level: 4, className: "cm-heading cm-heading--4" },
  ATXHeading5: { kind: "heading-line", level: 5, className: "cm-heading cm-heading--5" },
  ATXHeading6: { kind: "heading-line", level: 6, className: "cm-heading cm-heading--6" },

  // ----- Setext headings (`=====` / `-----` under text) -----
  SetextHeading1: { kind: "render-raw", why: "Phase 2: same line scaling as ATXHeading1" },
  SetextHeading2: { kind: "render-raw", why: "Phase 2: same line scaling as ATXHeading2" },

  // ----- Block-level constructs -----
  Blockquote: { kind: "line", className: "cm-blockquote" },
  BulletList: { kind: "structural", why: "ListItem children carry the styling" },
  OrderedList: { kind: "structural", why: "ListItem children carry the styling" },
  ListItem: { kind: "line", className: "cm-list-line" },
  FencedCode: { kind: "line", className: "cm-fenced-code" },
  CodeBlock: { kind: "render-raw", why: "Phase 2: indented code-block, same style as FencedCode" },
  HorizontalRule: { kind: "hide-with-widget", widget: "hr" }, // `---` → styled `<hr>` widget
  HTMLBlock: { kind: "hide-with-widget", widget: "html-block" },
  LinkReference: { kind: "render-raw", why: "Phase 2: reference-style links resolve in click handler" },

  // ----- Inline styling -----
  Emphasis: { kind: "mark", className: "cm-emphasis" },
  StrongEmphasis: { kind: "mark", className: "cm-strong" },
  InlineCode: { kind: "mark", className: "cm-inline-code" },
  Link: { kind: "mark", className: "cm-link" },
  Image: { kind: "hide-with-widget", widget: "image" }, // `![alt](src)` → inline `<img>` widget

  // ----- Inline literal sub-nodes (rendered inside their parent) -----
  URL: { kind: "hide-always" }, // `[text](URL)` — markdown URL is never visible
  LinkLabel: { kind: "render-raw", why: "visible inside Link; parent mark styles it" },
  LinkTitle: { kind: "hide-always" }, // `[text](URL "title")` — title never visible
  CodeText: { kind: "render-raw", why: "interior of FencedCode/InlineCode; parent decoration covers it" },
  CodeInfo: { kind: "hide-always" }, // language label after ```; never shown
  HardBreak: { kind: "structural", why: "trailing two-spaces or backslash, no visible glyph" },
  Comment: { kind: "render-raw", why: "Phase 2: dim inline HTML comments" },
  CommentBlock: { kind: "render-raw", why: "Phase 2: dim block HTML comments" },
  ProcessingInstruction: { kind: "render-raw", why: "Phase 2: dim like HTML comments" },
  ProcessingInstructionBlock: { kind: "render-raw", why: "Phase 2: dim like HTML comments" },
  Entity: { kind: "render-raw", why: "HTML entities like &amp; render as-is, by design" },
  Escape: { kind: "escape" }, // backslash-escape: `\'` renders as `'`, backslash hidden
  HTMLTag: { kind: "hide-with-widget", widget: "html-inline" },

  // ----- Syntax markers (hidden always — non-technical UX, distinct from Obsidian's Live Preview) -----
  HeaderMark: { kind: "hide-always" }, // `#` / `##` / …
  EmphasisMark: { kind: "hide-always" }, // `*` / `_`
  CodeMark: { kind: "hide-always" }, // backticks for inline / fence pairs for blocks
  LinkMark: { kind: "hide-always" }, // `[`/`]`/`(`/`)`
  QuoteMark: { kind: "hide-always" }, // `>`
  ListMark: { kind: "hide-with-widget", widget: "bullet" }, // replaced by a real `•` widget
  TaskMarker: { kind: "hide-with-widget", widget: "task-checkbox" }, // `[ ]` / `[x]` → real checkbox

  // ----- GFM extensions (enabled via `markdownLanguage`) -----
  Strikethrough: { kind: "mark", className: "cm-strikethrough" },
  // `~~` joins the hidden-marker system like EmphasisMark — the flanking
  // guard and delete normalizer already assume these semantics; leaving the
  // marks visible made deletion eat single tildes (interaction-spec §8.1).
  StrikethroughMark: { kind: "hide-always" },
  Subscript: { kind: "render-raw", why: "Phase 2: vertical-align: sub" },
  SubscriptMark: { kind: "render-raw", why: "Phase 2: hide `~` off-parent" },
  Superscript: { kind: "render-raw", why: "Phase 2: vertical-align: super" },
  SuperscriptMark: { kind: "render-raw", why: "Phase 2: hide `^` off-parent" },
  Emoji: { kind: "render-raw", why: "Phase 2: replace `:smile:` with the emoji glyph" },
  Autolink: { kind: "render-raw", why: "Phase 2: same style as Link" },
  Task: { kind: "render-raw", why: "Phase 2: render task list items with a real checkbox" },

  // GFM tables — handled by a dedicated StateField that emits the
  // block widget on Table nodes (CM6 forbids multi-line replace
  // from ViewPlugin, so the registry-driven plugin can't do this
  // shape; see tableField.ts).
  Table: { kind: "structural", why: "tableField StateField owns Table rendering" },
  TableHeader: { kind: "structural", why: "covered by Table widget" },
  TableRow: { kind: "structural", why: "covered by Table widget" },
  TableCell: { kind: "structural", why: "covered by Table widget" },
  TableDelimiter: { kind: "structural", why: "covered by Table widget" },
} as const;

export function lookupDecoration(nodeName: string): RegistryEntry | undefined {
  return MARKDOWN_DECORATION_REGISTRY[nodeName];
}
