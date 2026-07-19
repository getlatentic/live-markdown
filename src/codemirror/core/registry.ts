/**
 * Canonical table: every Lezer markdown node name → its {@link NodeRule} —
 * ONE place answering "how does this construct render". The Lezer parser
 * handles CommonMark + GFM spec compliance; this file is the visual contract.
 *
 * Why a table of rules (functions), not data:
 *
 *   1. **Completeness is auditable.** `registry.test.ts` reads the live
 *      parser's node set and fails when any node Lezer emits has no entry
 *      here — a lezer-markdown bump that adds a node trips the gate before
 *      it ships unstyled. Only the KEYS matter for that, so entries are free
 *      to be behavior.
 *   2. **Context is first-class.** A node name can mean different things in
 *      different parents (a URL inside `[text](url)` is chrome; a bare
 *      pasted URL is content — hiding it made an invisible dead zone).
 *      Every rule receives context; contextual entries are ordinary inline
 *      functions, readable at the point of definition.
 *   3. **Adding a construct touches one place.** A styled span is a
 *      one-liner via the combinators; a widget construct exports its rule
 *      from its own module and is listed here; an EXTENSION with its own
 *      grammar ships rules via `nodeRulesFacet` and never touches this file.
 *   4. **Deliberate non-styling stays documented.** `raw(why)` /
 *      `structural(why)` tag their rules; the coverage test insists the
 *      `why` is present.
 *
 * The rules speak {@link Paint} — CodeMirror's own mechanisms (line class,
 * span mark, hide, widget, nothing). That union is CLOSED: constructs grow,
 * ways to paint don't, so the single switch over Paint lives in the painter
 * (plugin.ts) and no new construct ever edits it.
 */

import { horizontalRuleRule } from "./hrWidget";
import { htmlBlockRule, htmlInlineRule } from "../html/htmlWidget";
import { imageRule } from "../image/imageWidget";
import { listMarkRule } from "../list/bulletWidget";
import {
  headingLine,
  hideAlways,
  line,
  mark,
  raw,
  structural,
  type NodeContext,
  type NodeRules,
} from "./paint";
import { taskMarkerRule } from "../list/taskCheckboxWidget";

/** Does this URL's parent Link render any visible label text? The label is
 *  everything between the opening `[` and closing `]` marks; whitespace-only
 *  counts as invisible (a lone space is a dead zone in practice). */
function linkHasVisibleLabel(ctx: NodeContext): boolean {
  const link = ctx.node.parent;
  if (!link) return false;
  let bracketOpen: { readonly to: number } | null = null;
  let bracketClose: { readonly from: number } | null = null;
  for (let child = link.firstChild; child; child = child.nextSibling) {
    if (child.name !== "LinkMark") continue;
    const mark = ctx.state.sliceDoc(child.from, child.to);
    if (mark === "[" && !bracketOpen) bracketOpen = child;
    else if (mark === "]" && !bracketClose) bracketClose = child;
  }
  if (!bracketOpen || !bracketClose || bracketClose.from <= bracketOpen.to) return false;
  return ctx.state.sliceDoc(bracketOpen.to, bracketClose.from).trim() !== "";
}

export const NODE_RULES: NodeRules = {
  // ----- Structural wrappers (never directly styled) -----
  Document: structural("top-level wrapper"),
  Paragraph: structural("body font is the default"),

  // ----- ATX headings (`# H1` … `###### H6`) -----
  ATXHeading1: headingLine("cm-heading cm-heading--1"),
  ATXHeading2: headingLine("cm-heading cm-heading--2"),
  ATXHeading3: headingLine("cm-heading cm-heading--3"),
  ATXHeading4: headingLine("cm-heading cm-heading--4"),
  ATXHeading5: headingLine("cm-heading cm-heading--5"),
  ATXHeading6: headingLine("cm-heading cm-heading--6"),

  // ----- Setext headings (`=====` / `-----` under text) -----
  SetextHeading1: raw("Phase 2: same line scaling as ATXHeading1"),
  SetextHeading2: raw("Phase 2: same line scaling as ATXHeading2"),

  // ----- Block-level constructs -----
  Blockquote: line("cm-blockquote"),
  BulletList: structural("ListItem children carry the styling"),
  OrderedList: structural("ListItem children carry the styling"),
  ListItem: line("cm-list-line"),
  FencedCode: line("cm-fenced-code"),
  CodeBlock: raw("Phase 2: indented code-block, same style as FencedCode"),
  HorizontalRule: horizontalRuleRule, // `---` → styled `<hr>` widget
  HTMLBlock: htmlBlockRule,
  LinkReference: raw("Phase 2: reference-style links resolve in click handler"),

  // ----- Inline styling -----
  Emphasis: mark("cm-emphasis"),
  StrongEmphasis: mark("cm-strong"),
  InlineCode: mark("cm-inline-code"),
  Link: mark("cm-link"),
  Image: imageRule, // `![alt](src)` → inline `<img>` widget

  // ----- Inline literal sub-nodes (rendered inside their parent) -----
  // Inside a Link the URL is chrome ONLY when a visible label exists — for
  // `[](url)` / `[ ](url)` the URL is the link's entire visible content, and
  // hiding it (with the marks already hidden) left an invisible dead zone.
  // Bare GFM autolinks and <angle> autolinks emit the SAME node name, and
  // there the URL IS the content — same class of bug when hidden.
  URL: (ctx) => {
    if (ctx.parentName !== "Link") return { paint: "mark", className: "cm-link" };
    return linkHasVisibleLabel(ctx)
      ? { paint: "hide" }
      : { paint: "mark", className: "cm-link" };
  },
  LinkLabel: raw("visible inside Link; parent mark styles it"),
  LinkTitle: hideAlways(), // `[text](URL "title")` — title never visible
  CodeText: raw("interior of FencedCode/InlineCode; parent decoration covers it"),
  CodeInfo: mark("cm-code-info"), // language tag on the opener row — visible so typing there is never invisible (§12.4)
  HardBreak: structural("trailing two-spaces or backslash, no visible glyph"),
  Comment: raw("Phase 2: dim inline HTML comments"),
  CommentBlock: raw("Phase 2: dim block HTML comments"),
  ProcessingInstruction: raw("Phase 2: dim like HTML comments"),
  ProcessingInstructionBlock: raw("Phase 2: dim like HTML comments"),
  Entity: raw("HTML entities like &amp; render as-is, by design"),
  // Backslash-escape: hide only the leading `\`, so `\'` renders as `'` per
  // CommonMark rather than showing a literal backslash.
  Escape: (ctx) => ({
    paint: "hide",
    range: { from: ctx.from, to: ctx.from + 1 },
    expandSpace: false,
  }),
  HTMLTag: htmlInlineRule,

  // ----- Syntax markers (hidden always — non-technical UX, distinct from Obsidian's Live Preview) -----
  // `#` marks on ATX headings hide; a SETEXT heading's underline is that
  // heading's only marker on its own line — hiding it left an invisible,
  // unclickable dead line. Visible until setext gets real styling.
  HeaderMark: (ctx) =>
    ctx.parentName?.startsWith("SetextHeading") ? { paint: "none" } : { paint: "hide" },
  EmphasisMark: hideAlways(), // `*` / `_`
  CodeMark: hideAlways(), // backticks for inline / fence pairs for blocks
  LinkMark: hideAlways(), // `[`/`]`/`(`/`)`
  QuoteMark: hideAlways(), // `>`
  ListMark: listMarkRule, // `-`/`1.` → bullet / number / nothing beside a checkbox
  TaskMarker: taskMarkerRule, // `[ ]` / `[x]` → real checkbox

  // ----- GFM extensions (enabled via `markdownLanguage`) -----
  Strikethrough: mark("cm-strikethrough"),
  // `~~` joins the hidden-marker system like EmphasisMark — the flanking
  // guard and delete normalizer already assume these semantics; leaving the
  // marks visible made deletion eat single tildes (interaction-spec §8.1).
  StrikethroughMark: hideAlways(),
  Subscript: raw("Phase 2: vertical-align: sub"),
  SubscriptMark: raw("Phase 2: hide `~` off-parent"),
  Superscript: raw("Phase 2: vertical-align: super"),
  SuperscriptMark: raw("Phase 2: hide `^` off-parent"),
  Emoji: raw("Phase 2: replace `:smile:` with the emoji glyph"),
  Autolink: raw("wrapper of a visible URL child; Phase 2 wires click-to-open"),
  Task: raw("Phase 2: render task list items with a real checkbox"),

  // GFM tables — handled by a dedicated StateField that emits the block
  // widget on Table nodes (CM6 forbids multi-line replace from a ViewPlugin,
  // so this rules-driven plugin can't do that shape; see tableField.ts).
  Table: structural("tableField StateField owns Table rendering"),
  TableHeader: structural("covered by Table widget"),
  TableRow: structural("covered by Table widget"),
  TableCell: structural("covered by Table widget"),
  TableDelimiter: structural("covered by Table widget"),
};
