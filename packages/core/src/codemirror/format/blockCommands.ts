/**
 * Block-level commands — heading levels, bullet/ordered list, blockquote.
 *
 * Each command operates on the current line at the caret. Toggle
 * semantics: applying H2 to a line that's already H2 removes the
 * heading; applying H2 to a line that's H1 swaps the marker.
 *
 * These commands edit the **markdown source** at the line start.
 * Lezer reparses, decorations recompute, the heading / list / quote
 * appears rendered. No special rendering pipeline — the markers go
 * through the same hide-always treatment as user-typed markdown.
 *
 * Selection-aware: if a non-empty selection spans multiple lines,
 * the operation applies to every line. (Useful for bullet/quote.)
 */

import { EditorSelection, type ChangeSpec, type Line, Prec } from "@codemirror/state";
import { type Command, EditorView, keymap } from "@codemirror/view";

import { lineStructure, type LineStructure } from "../core/lineStructure";

function eachLineInSelection(view: EditorView): Line[] {
  const lines: Line[] = [];
  const seen = new Set<number>();
  for (const range of view.state.selection.ranges) {
    let pos = range.from;
    while (pos <= range.to) {
      const line = view.state.doc.lineAt(pos);
      if (!seen.has(line.number)) {
        seen.add(line.number);
        lines.push(line);
      }
      if (line.to >= range.to) break;
      pos = line.to + 1;
    }
  }
  return lines;
}

function dispatchLineChanges(view: EditorView, changes: ChangeSpec[], userEvent: string): boolean {
  if (changes.length === 0) return true;
  const changeSet = view.state.changes(changes);
  // Map the selection with assoc +1 so the caret rides forward over a prepended
  // marker, staying with the user's text rather than stranding before it.
  view.dispatch({ changes: changeSet, selection: view.state.selection.map(changeSet, 1), userEvent });
  return true;
}

// Heading, bullet, and ordered are mutually-exclusive line types: setting one
// replaces any other already on the line (so `- x` → heading is `## x`, not
// `## - x`). Blockquote and code are containers — they compose — so they're not
// part of this set. Line classification comes from the SYNTAX TREE
// (lineStructure, #61): a `- x` inside a code fence is code, not a bullet, and
// a nested `  - x` is a bullet even though its marker isn't at column 0.

/** The selected lines the structure commands may touch, each with what the
 * grammar says it is. Code lines are excluded wholesale — a formatting toolbar
 * must never rewrite code. */
function structuredLines(view: EditorView): { line: Line; info: LineStructure }[] {
  return eachLineInSelection(view)
    .map((line) => ({ line, info: lineStructure(view.state, line) }))
    .filter(({ info }) => !info.inCode);
}

/** Replace this line's current type marker (heading or list, whichever the
 * tree found) with `marker`, or insert `marker` at the content start — so
 * nested/indented lines keep their indentation. */
function swapLineMarker({ info }: { info: LineStructure }, marker: string): ChangeSpec {
  const existing = info.heading ?? info.list;
  return existing
    ? { from: existing.markFrom, to: existing.markTo, insert: marker }
    : { from: info.contentFrom, insert: marker };
}

/* -------- Heading -------- */

function makeToggleHeading(level: 1 | 2 | 3 | 4 | 5 | 6): Command {
  const marker = `${"#".repeat(level)} `;
  return (view) => {
    const changes: ChangeSpec[] = [];
    for (const entry of structuredLines(view)) {
      const { info } = entry;
      if (info.heading && info.heading.level === level) {
        // Already this level → back to a paragraph.
        changes.push({ from: info.heading.markFrom, to: info.heading.markTo, insert: "" });
      } else {
        changes.push(swapLineMarker(entry, marker));
      }
    }
    return dispatchLineChanges(view, changes, "input.format.heading");
  };
}

/* -------- Bullet list -------- */

// All-or-nothing toggle: strip the list only when *every* selected line is
// already a bullet, otherwise make them all bullets (converting ordered items
// and leaving existing bullets be). A per-line toggle would make a mixed
// selection more inconsistent — un-bulleting some lines while bulleting others.
const toggleBulletList: Command = (view) => {
  const entries = structuredLines(view);
  const allBullets =
    entries.length > 0 && entries.every(({ info }) => info.list?.kind === "bullet");
  const changes: ChangeSpec[] = [];
  for (const entry of entries) {
    const { info } = entry;
    if (allBullets) {
      changes.push({ from: info.list!.markFrom, to: info.list!.markTo, insert: "" });
    } else if (info.list?.kind !== "bullet") {
      changes.push(swapLineMarker(entry, "- "));
    }
  }
  return dispatchLineChanges(view, changes, "input.format.list");
};

/* -------- Ordered list -------- */

// All-or-nothing toggle (see bullets). When making the selection ordered, every
// line is (re)numbered from 1 so a mixed or mis-numbered selection comes out
// sequential.
const toggleOrderedList: Command = (view) => {
  const entries = structuredLines(view);
  const allOrdered =
    entries.length > 0 && entries.every(({ info }) => info.list?.kind === "ordered");
  const changes: ChangeSpec[] = [];
  let counter = 0;
  for (const entry of entries) {
    const { info } = entry;
    if (allOrdered) {
      changes.push({ from: info.list!.markFrom, to: info.list!.markTo, insert: "" });
    } else {
      counter += 1;
      changes.push(swapLineMarker(entry, `${counter}. `));
    }
  }
  return dispatchLineChanges(view, changes, "input.format.list");
};

/* -------- Task list -------- */

// All-or-nothing toggle: strip the checkbox prefix only when every selected line
// is already a task, otherwise make them all tasks (replacing any other line
// marker; a plain line or other list item gains a `- [ ] `).
const toggleTaskList: Command = (view) => {
  const entries = structuredLines(view);
  const allTasks = entries.length > 0 && entries.every(({ info }) => info.list?.task);
  const changes: ChangeSpec[] = [];
  for (const entry of entries) {
    const { info } = entry;
    if (allTasks) {
      changes.push({ from: info.list!.markFrom, to: info.list!.markTo, insert: "" });
    } else if (!info.list?.task) {
      changes.push(swapLineMarker(entry, "- [ ] "));
    }
  }
  return dispatchLineChanges(view, changes, "input.format.task");
};

/* -------- Blockquote -------- */

// Per-line (not all-or-nothing): quotes are containers, so each line
// independently gains a level or sheds its outermost one.
const toggleBlockquote: Command = (view) => {
  const changes: ChangeSpec[] = [];
  for (const { info } of structuredLines(view)) {
    changes.push(
      info.quote
        ? { from: info.quote.markFrom, to: info.quote.markTo, insert: "" }
        : { from: info.contentFrom, insert: "> " },
    );
  }
  return dispatchLineChanges(view, changes, "input.format.blockquote");
};

/* -------- Code block (toggle fenced block around selection) -------- */

const toggleCodeBlock: Command = (view) => {
  const sel = view.state.selection.main;
  // Toggle a fence around the current/selection lines.
  const firstLine = view.state.doc.lineAt(sel.from);
  const lastLine = view.state.doc.lineAt(sel.to);
  // Detect if both fences already exist (line before firstLine starts
  // with ``` and line after lastLine starts with ```).
  const above = firstLine.number > 1 ? view.state.doc.line(firstLine.number - 1) : null;
  const below = lastLine.number < view.state.doc.lines ? view.state.doc.line(lastLine.number + 1) : null;
  if (above && /^```/.test(above.text) && below && /^```/.test(below.text)) {
    // Strip both fences
    view.dispatch({
      changes: [
        { from: above.from, to: above.to + 1, insert: "" },
        { from: below.from - 1, to: below.to, insert: "" },
      ],
      userEvent: "input.format.code-block",
    });
    return true;
  }
  // Wrap selection in fences. The fence must be LONGER than any backtick run
  // inside the wrapped content — wrapping text that itself contains ``` with a
  // ``` fence would close the block early and spill the rest as prose.
  const inner = view.state.sliceDoc(firstLine.from, lastLine.to);
  const longestRun = (inner.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  view.dispatch({
    changes: [
      { from: firstLine.from, insert: `${fence}\n` },
      { from: lastLine.to, insert: `\n${fence}` },
    ],
    selection: EditorSelection.cursor(firstLine.from + fence.length + 1),
    userEvent: "input.format.code-block",
  });
  return true;
};

/* -------- Insert table (GFM 2×2 skeleton) -------- */

const TABLE_SKELETON = "| Header | Header |\n| --- | --- |\n| Cell | Cell |";
// Offset from the table's start to the first header cell's content, so the
// caret lands ready to type the first column header ("| " → 2 chars in).
const FIRST_CELL_OFFSET = 2;

// GFM requires a blank line before a table for it to parse as one. Insert the
// skeleton on its own block: in place when the caret sits on a blank line,
// otherwise pushed below the current line with a separating blank line.
const insertTable: Command = (view) => {
  const sel = view.state.selection.main;
  const line = view.state.doc.lineAt(sel.from);
  const onBlankLine = line.text.trim().length === 0;

  const prefix = onBlankLine ? "" : "\n\n";
  const from = onBlankLine ? line.from : line.to;
  const to = line.to;
  const caret = from + prefix.length + FIRST_CELL_OFFSET;

  view.dispatch({
    changes: { from, to, insert: `${prefix}${TABLE_SKELETON}` },
    selection: EditorSelection.range(caret, caret + "Header".length),
    userEvent: "input.format.table",
  });
  return true;
};

export const blockCommands = {
  toggleHeading1: makeToggleHeading(1),
  toggleHeading2: makeToggleHeading(2),
  toggleHeading3: makeToggleHeading(3),
  toggleBulletList,
  toggleOrderedList,
  toggleTaskList,
  toggleBlockquote,
  toggleCodeBlock,
  insertTable,
};

export const blockCommandsKeymap = Prec.high(
  keymap.of([
    { key: "Mod-1", run: blockCommands.toggleHeading1 },
    { key: "Mod-2", run: blockCommands.toggleHeading2 },
    { key: "Mod-3", run: blockCommands.toggleHeading3 },
    { key: "Mod-Shift-7", run: blockCommands.toggleOrderedList },
    { key: "Mod-Shift-8", run: blockCommands.toggleBulletList },
    { key: "Mod-Shift-9", run: blockCommands.toggleBlockquote },
  ]),
);
