import { EditorSelection, Prec, type EditorState } from "@codemirror/state";
import { keymap, type Command, type EditorView } from "@codemirror/view";

import { lineStructure } from "../core/lineStructure";
import { treeAt } from "../core/treeAt";
import { outdentListItem } from "./listIndent";

/**
 * Tight list continuation on Enter.
 *
 * `@codemirror/lang-markdown`'s stock `insertNewlineContinueMarkup` continues a
 * list when you press Enter, but for any list it considers "non-tight" (loose —
 * because a blank line crept in, or a paragraph lazily continues below the
 * list) it PREPENDS a blank line on every Enter. To the user that reads as the
 * caret "skipping a line": you wanted a new bullet on the very next line and
 * got a gap instead. People editing a rich bullet list expect Enter to always
 * drop the next bullet tight against the current one.
 *
 * This command handles two cases: Enter at the END of a NON-EMPTY, non-task
 * bullet/ordered item — inserting a plain `\n<indent><marker> ` with no blank
 * line, always tight — and Enter at a TASK item's content start, splitting it
 * into an empty unchecked box above and the original item below (#95), and
 * Enter on an empty item, which leaves the list. Task continuation at line end, code blocks,
 * blockquotes, other mid-line splits, and every non-list case return `false`
 * and fall through to the stock markdown / default Enter handlers, so their
 * existing behavior is untouched. Bound at `Prec.highest` so it runs before
 * the markdown keymap's Enter.
 */
export const tightListContinuation: Command = (view) => {
  const { state } = view;
  const { main } = state.selection;
  if (!main.empty) return false;
  const line = state.doc.lineAt(main.head);

  // Task-item split at the content start (#95). The stock handler leaves the
  // remaining empty item spelled `- [ ]` — WITHOUT the trailing space — and
  // the grammar reads that as a bullet whose text is a literal `[ ]`, so the
  // checkbox markdown shows raw. Emit the split ourselves: the current line
  // keeps an empty UNCHECKED box (`- [ ] `, space intact), the text moves to
  // a new item that keeps the original marker and checked state.
  const info = lineStructure(state, line);
  if (
    info.list?.task &&
    !info.inCode &&
    main.head === info.list.markTo &&
    info.list.markTo < line.to
  ) {
    const mark = state.sliceDoc(info.list.markFrom, info.list.markTo);
    const indent = state.sliceDoc(line.from, info.list.markFrom);
    const insert = `${state.lineBreak}${indent}${mark}`;
    view.dispatch({
      changes: [
        // Same length as `mark` — the caret math below relies on that.
        { from: info.list.markFrom, to: info.list.markTo, insert: mark.replace(/\[[xX]\]/, "[ ]") },
        { from: main.head, insert },
      ],
      selection: EditorSelection.cursor(main.head + insert.length),
      scrollIntoView: true,
      userEvent: "input",
    });
    return true;
  }

  // Enter on an item with no text leaves the list: a nested item moves out
  // one level, a top-level one becomes an empty line. The stock handler
  // instead opens a gap above a list's second item, which reads as nothing
  // happening.
  if (info.list && !info.inCode && state.sliceDoc(info.list.markTo, line.to).trim() === "") {
    const nested = info.list.markFrom > line.from && state.sliceDoc(line.from, info.list.markFrom).trim() === "";
    if (nested) return outdentListItem(view);
    view.dispatch({
      changes: { from: info.list.markFrom, to: line.to },
      selection: EditorSelection.cursor(info.list.markFrom),
      scrollIntoView: true,
      userEvent: "input",
    });
    return true;
  }

  // Enter at the start of an item's further line, or of an item that stands
  // directly under a paragraph, opens the line above it. Splitting there
  // would leave a marker or an indent on a line of its own, which the grammar
  // reads three different ways by the list's type.
  const atTextStart = main.head === (info.list?.markTo ?? info.contentFrom) && main.head < line.to && !info.inCode;
  if (atTextStart && !info.list && !info.heading && !info.quote && info.contentFrom > line.from && inListItem(state, main.head)) {
    return openLineAbove(view, line.from, "");
  }
  if (atTextStart && info.list && !info.list.task && underParagraph(state, line.number)) {
    const marker = state.sliceDoc(line.from, info.list.markTo).trimEnd();
    return openLineAbove(view, line.from, `${state.lineBreak}${marker}`);
  }

  // Only when continuing from the very end of the line — not splitting mid-item.
  if (main.head !== line.to) return false;

  const match = /^(\s*)([-*+]|\d+[.)])\s+(\S.*)$/.exec(line.text);
  if (!match) return false; // empty item or not a list line → let the stock handler decide
  const [, indent, marker, content] = match;
  if (/^\[[ xX]\]/.test(content)) return false; // task item → stock handler keeps the checkbox

  // Confirm we're genuinely inside a list and NOT a code block (a `- x` line
  // inside a fenced block matches the regex but must not be auto-continued).
  let inList = false;
  const cursor = treeAt(state, main.head).resolveInner(main.head, -1).cursor();
  do {
    const name = cursor.name;
    if (name === "ListItem" || name === "BulletList" || name === "OrderedList") {
      inList = true;
    }
    if (/Code/.test(name)) return false;
  } while (cursor.parent());
  if (!inList) return false;

  const ordered = /^(\d+)([.)])$/.exec(marker);
  const nextMarker = ordered ? `${parseInt(ordered[1], 10) + 1}${ordered[2]}` : marker;
  const insert = `${state.lineBreak}${indent}${nextMarker} `;
  view.dispatch({
    changes: { from: main.head, insert },
    selection: EditorSelection.cursor(main.head + insert.length),
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
};

/** Insert `above` and a line break in front of the line at `lineFrom`,
 *  keeping the caret in the text it was in. */
function openLineAbove(view: EditorView, lineFrom: number, above: string): boolean {
  const insert = above + view.state.lineBreak;
  view.dispatch({
    changes: { from: lineFrom, insert },
    selection: EditorSelection.cursor(view.state.selection.main.head + insert.length),
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
}

function inListItem(state: EditorState, pos: number): boolean {
  const cursor = treeAt(state, pos).resolveInner(pos, 1).cursor();
  do {
    if (/Code/.test(cursor.name)) return false;
    if (cursor.name === "ListItem") return true;
  } while (cursor.parent());
  return false;
}

/** The line above is text outside any list. An empty item cannot begin a
 *  list there, so one opened above this line needs an empty line first. */
function underParagraph(state: EditorState, lineNumber: number): boolean {
  if (lineNumber === 1) return false;
  const above = state.doc.line(lineNumber - 1);
  if (above.text.trim() === "") return false;
  const structure = lineStructure(state, above);
  return !structure.list && !structure.heading && !structure.inCode && !inListItem(state, structure.contentFrom);
}

export const tightListKeymap = Prec.highest(
  keymap.of([{ key: "Enter", run: tightListContinuation }]),
);
