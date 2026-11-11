/**
 * The editor's editing behaviour: every key binding and typing rule, in the
 * order they take precedence. The component composes these three groups with
 * its rendering and host extensions in between; tests of editing rules load
 * {@link editingStack}, so they run the bindings the editor runs.
 */

import { defaultKeymap, historyKeymap } from "@codemirror/commands";
import { markdown, markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import type { Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";

import { fenceAutoCloseKeymap, fenceCaretGuard, fenceTabKeymap, fenceTypeAutoClose } from "./code";
import { blockCommandsKeymap, formatCommandsKeymap } from "./format";
import { cursorModelKeymap, deleteNormalizerKeymap, flankingGuard, groupDeleteKeymap, headingEnterKeymap } from "./interaction";
import { continuationIndent, listIndentKeymap, numberEditing, tightListKeymap } from "./list";

/** Typing rules, and the keys that belong to lists and code blocks. */
export const lineEditing: Extension[] = [
  // Tight list continuation — Enter drops the next bullet directly below,
  // never with a blank-line gap (overrides the stock markdown Enter for
  // non-empty list items; see listContinuation.ts).
  tightListKeymap,
  // Enter at the start of a heading moves the heading down whole
  // (headingEnter.ts).
  headingEnterKeymap,
  // A click on an ordered item's number opens it for editing; Enter or
  // Escape confirms it (numberEditing.ts).
  numberEditing,
  // A line continuing a list item draws under the item's text
  // (continuationIndent.ts).
  continuationIndent,
  // Enter on a just-typed ``` closes the fence with the caret inside —
  // an unclosed fence would swallow the rest of the document (#91).
  fenceAutoCloseKeymap,
  // The keystroke completing a bare ``` closes the fence immediately, so
  // an unclosed opener never swallows the document below (§9.5).
  fenceTypeAutoClose,
  // Tab indents inside a code block (Shift-Tab dedents) — otherwise the
  // browser's focus navigation steals the key mid-code (§12.8).
  fenceTabKeymap,
  // The caret never parks on a fence's marker rows: clicks land on the
  // nearest content edge, arrow motion crosses out of the block (§12.9).
  fenceCaretGuard,
];

/** The grammar, and the stock keys under the editor's own. */
export const grammarAndStockKeys: Extension[] = [
  // Tab / Shift-Tab nest / promote a list item by the parent marker width
  // (list-aware; falls through to normal Tab outside a list — listIndent.ts).
  listIndentKeymap,
  // The markdown keys go before the stock ones, which bind the same keys
  // and take them all. `addKeymap: false` below keeps them at this
  // precedence: left on, `markdown()` binds them a second time above the
  // editor's own Backspace, whose list rules then never run.
  keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap]),
  // markdownLanguage = CommonMark + GFM (tables, task lists,
  // strikethrough). Without `base`, `markdown()` uses bare
  // CommonMark — Lezer never produces Table / Task / Strikethrough
  // nodes and our registry can't decorate them.
  //
  // `remove: ["SetextHeading"]` disables setext headings — the rule that a
  // line of text immediately followed by a line of `---` (or `===`) turns
  // the text into a heading. That rule silently rewrites the line ABOVE
  // when you type `-` under a paragraph, which is surprising in a rich
  // editor (and fought our "lone `-` is literal until a space" bullet
  // rule). ATX `#` headings are unaffected.
  // `codeLanguages` gives fenced blocks a real nested parse (lazily
  // loaded per info string) — actual syntax highlighting via
  // codeHighlight, which styles only code-emitted tags (ADR 0002).
  markdown({
    base: markdownLanguage,
    codeLanguages: languages,
    addKeymap: false,
    extensions: [{ remove: ["SetextHeading"] }],
  }),
];

/** Keys that act on visible text rather than on the source. */
export const visibleTextKeys: Extension[] = [
  // Cursor model: arrow/shift+arrow → next visible source
  // position, skipping hidden markdown syntax in one step.
  cursorModelKeymap,
  // Backspace / Delete: removes visible content; collapses an
  // emptied styled span (no dangling `****`).
  deleteNormalizerKeymap,
  // Word and line deletion by the same rules (groupDelete.ts).
  groupDeleteKeymap,
  // Cmd+B / Cmd+I / Cmd+E: toggle bold / italic / inline code.
  formatCommandsKeymap,
  // Cmd+1..3 / Cmd+Shift+7..9: heading levels, lists, blockquote.
  blockCommandsKeymap,
];

export const editingStack: Extension[] = [
  // Whitespace typed at a bold/italic/strike content edge lands outside
  // the markers, or the closing delimiter stops parsing (#94).
  flankingGuard,
  ...lineEditing,
  ...grammarAndStockKeys,
  ...visibleTextKeys,
];
