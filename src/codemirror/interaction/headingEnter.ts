/**
 * Enter at the start of a heading's text moves the heading down a line and
 * leaves an empty line above it. Splitting there, as Enter does elsewhere,
 * would keep the hashes on the empty line and turn the heading's text into
 * body text.
 */

import { EditorSelection, Prec } from "@codemirror/state";
import { keymap, type Command } from "@codemirror/view";

import { lineStructure } from "../core/lineStructure";

export const headingStartEnter: Command = (view) => {
  const { state } = view;
  const { main } = state.selection;
  if (!main.empty) return false;
  const line = state.doc.lineAt(main.head);
  const { heading, list } = lineStructure(state, line);
  if (!heading || list || main.head !== heading.markTo || heading.markTo === line.to) return false;
  // What stands in front of the hashes (a quote's `> `) starts both lines.
  const insert = state.lineBreak + state.sliceDoc(line.from, heading.markFrom);
  view.dispatch({
    changes: { from: heading.markFrom, insert },
    selection: EditorSelection.cursor(main.head + insert.length),
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
};

export const headingEnterKeymap = Prec.highest(keymap.of([{ key: "Enter", run: headingStartEnter }]));
