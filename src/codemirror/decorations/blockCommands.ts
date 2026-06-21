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
  view.dispatch({ changes, userEvent });
  return true;
}

/* -------- Heading -------- */

function makeToggleHeading(level: 1 | 2 | 3 | 4 | 5 | 6): Command {
  return (view) => {
    const changes: ChangeSpec[] = [];
    for (const line of eachLineInSelection(view)) {
      const m = line.text.match(/^(#{1,6}) /);
      if (m && m[1].length === level) {
        // Same level → strip
        changes.push({ from: line.from, to: line.from + m[0].length, insert: "" });
      } else if (m) {
        // Different level → swap marker
        changes.push({ from: line.from, to: line.from + m[1].length, insert: "#".repeat(level) });
      } else {
        // Not a heading → prepend
        changes.push({ from: line.from, insert: "#".repeat(level) + " " });
      }
    }
    return dispatchLineChanges(view, changes, "input.format.heading");
  };
}

/* -------- Bullet list -------- */

const toggleBulletList: Command = (view) => {
  const changes: ChangeSpec[] = [];
  for (const line of eachLineInSelection(view)) {
    const m = line.text.match(/^(- |\* )/);
    if (m) {
      changes.push({ from: line.from, to: line.from + m[0].length, insert: "" });
    } else {
      // Also strip ordered-list marker if present
      const ord = line.text.match(/^\d+\. /);
      if (ord) {
        changes.push({ from: line.from, to: line.from + ord[0].length, insert: "- " });
      } else {
        changes.push({ from: line.from, insert: "- " });
      }
    }
  }
  return dispatchLineChanges(view, changes, "input.format.list");
};

/* -------- Ordered list -------- */

const toggleOrderedList: Command = (view) => {
  const changes: ChangeSpec[] = [];
  let counter = 0;
  for (const line of eachLineInSelection(view)) {
    counter += 1;
    const m = line.text.match(/^(\d+\. )/);
    if (m) {
      changes.push({ from: line.from, to: line.from + m[0].length, insert: "" });
    } else {
      const bul = line.text.match(/^(- |\* )/);
      const marker = `${counter}. `;
      if (bul) {
        changes.push({ from: line.from, to: line.from + bul[0].length, insert: marker });
      } else {
        changes.push({ from: line.from, insert: marker });
      }
    }
  }
  return dispatchLineChanges(view, changes, "input.format.list");
};

/* -------- Blockquote -------- */

const toggleBlockquote: Command = (view) => {
  const changes: ChangeSpec[] = [];
  for (const line of eachLineInSelection(view)) {
    const m = line.text.match(/^> /);
    if (m) {
      changes.push({ from: line.from, to: line.from + m[0].length, insert: "" });
    } else {
      changes.push({ from: line.from, insert: "> " });
    }
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
  // Wrap selection in fences
  view.dispatch({
    changes: [
      { from: firstLine.from, insert: "```\n" },
      { from: lastLine.to, insert: "\n```" },
    ],
    selection: EditorSelection.cursor(firstLine.from + 4),
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
