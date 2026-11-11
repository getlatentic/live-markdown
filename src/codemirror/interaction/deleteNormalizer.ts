/**
 * Backspace and Delete on visible text — spec §8. Backspace with a caret is
 * a line key: the line-key table chooses its rule (`lineKeys/table.ts`).
 */

import { Prec } from "@codemirror/state";
import { keymap, type Command } from "@codemirror/view";

import { lineKey } from "../lineKeys/lineKey";
import { applyDeletion, visibleDeleteForward } from "./visibleDelete";

export * from "./visibleDelete";

export const visibleBackspace: Command = (view) => {
  const sel = view.state.selection.main;
  if (!sel.empty) return applyDeletion(view, sel.from, sel.to);
  return sel.head === 0 || lineKey(view, "Backspace");
};

export const deleteNormalizerKeymap = Prec.high(
  keymap.of([
    { key: "Backspace", run: visibleBackspace },
    { key: "Delete", run: visibleDeleteForward },
  ]),
);
