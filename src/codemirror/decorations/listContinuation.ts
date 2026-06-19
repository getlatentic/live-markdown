import { syntaxTree } from "@codemirror/language";
import { EditorSelection, Prec } from "@codemirror/state";
import { keymap, type Command } from "@codemirror/view";

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
 * This command handles the common case — Enter at the END of a NON-EMPTY,
 * non-task bullet/ordered item — by inserting a plain `\n<indent><marker> `
 * with no blank line, always tight. Empty items (exit-the-list), task items,
 * code blocks, blockquotes, mid-line splits, and every non-list case return
 * `false` and fall through to the stock markdown / default Enter handlers, so
 * their existing behavior is untouched. Bound at `Prec.highest` so it runs
 * before the markdown keymap's Enter.
 */
const tightListContinuation: Command = (view) => {
  const { state } = view;
  const { main } = state.selection;
  if (!main.empty) return false;
  const line = state.doc.lineAt(main.head);
  // Only when continuing from the very end of the line — not splitting mid-item.
  if (main.head !== line.to) return false;

  const match = /^(\s*)([-*+]|\d+[.)])\s+(\S.*)$/.exec(line.text);
  if (!match) return false; // empty item or not a list line → let the stock handler decide
  const [, indent, marker, content] = match;
  if (/^\[[ xX]\]/.test(content)) return false; // task item → stock handler keeps the checkbox

  // Confirm we're genuinely inside a list and NOT a code block (a `- x` line
  // inside a fenced block matches the regex but must not be auto-continued).
  let inList = false;
  const cursor = syntaxTree(state).resolveInner(main.head, -1).cursor();
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

export const tightListKeymap = Prec.highest(
  keymap.of([{ key: "Enter", run: tightListContinuation }]),
);
