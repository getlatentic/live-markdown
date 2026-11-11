/**
 * Backspace and Delete on visible text — spec §8. They are line keys: the
 * line-key table chooses their rule (`lineKeys/table.ts`).
 */

import { Prec } from "@codemirror/state";
import { keymap, type Command } from "@codemirror/view";

import { lineKey } from "../lineKeys/lineKey";

export * from "./visibleDelete";

export const visibleBackspace: Command = (view) => {
  const sel = view.state.selection.main;
  return (sel.empty && sel.head === 0) || lineKey(view, "Backspace");
};

export const visibleDeleteForward: Command = (view) => {
  const sel = view.state.selection.main;
  return (sel.empty && sel.head >= view.state.doc.length) || lineKey(view, "Delete");
};

export const deleteNormalizerKeymap = Prec.high(
  keymap.of([
    { key: "Backspace", run: visibleBackspace },
    { key: "Delete", run: visibleDeleteForward },
  ]),
);
