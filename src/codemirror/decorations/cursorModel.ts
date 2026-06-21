/**
 * Cursor model — visible-position navigation across hidden markdown
 * syntax.
 *
 * Per spec section 6.3, in Rich Edit Mode the caret may never land
 * inside a hidden marker. The natural CM6 atomic-ranges behaviour
 * snaps the caret to the nearest *boundary* of a hidden region —
 * but boundaries of a hidden region look the same visually (the
 * `**` between them is hidden), so left-arrow from "end of bold"
 * appears to do nothing on the first press and only moves on the
 * second.
 *
 * This module replaces those motions with commands that compute
 * the **next visible source position** in one step:
 *
 *   1. Step one source character in the desired direction.
 *   2. If that step landed strictly inside an atomic range, jump
 *      past the range entirely (one character beyond its far edge).
 *   3. Repeat until the position is outside every atomic range or
 *      at the document boundary.
 *
 * The output is the position the user expects: one visible char
 * to the left or right of where they were. Hidden markers cease to
 * exist as cursor stops.
 *
 * Wired at `Prec.high` so the bindings beat `defaultKeymap`.
 */

import { EditorSelection, Prec } from "@codemirror/state";
import { type Command, keymap } from "@codemirror/view";

import { nextVisiblePosition, previousVisiblePosition } from "./visiblePosition";

export const cursorVisibleCharLeft: Command = (view) => {
  const main = view.state.selection.main;
  const newPos = main.empty
    ? previousVisiblePosition(view, main.head)
    : Math.min(main.from, main.to);
  view.dispatch({
    selection: EditorSelection.cursor(newPos),
    userEvent: "select.move",
    scrollIntoView: true,
  });
  return true;
};

export const cursorVisibleCharRight: Command = (view) => {
  const main = view.state.selection.main;
  const newPos = main.empty
    ? nextVisiblePosition(view, main.head)
    : Math.max(main.from, main.to);
  view.dispatch({
    selection: EditorSelection.cursor(newPos),
    userEvent: "select.move",
    scrollIntoView: true,
  });
  return true;
};

export const selectVisibleCharLeft: Command = (view) => {
  const main = view.state.selection.main;
  view.dispatch({
    selection: EditorSelection.range(main.anchor, previousVisiblePosition(view, main.head)),
    userEvent: "select.extend",
    scrollIntoView: true,
  });
  return true;
};

export const selectVisibleCharRight: Command = (view) => {
  const main = view.state.selection.main;
  view.dispatch({
    selection: EditorSelection.range(main.anchor, nextVisiblePosition(view, main.head)),
    userEvent: "select.extend",
    scrollIntoView: true,
  });
  return true;
};

export const cursorModelKeymap = Prec.high(
  keymap.of([
    { key: "ArrowLeft", run: cursorVisibleCharLeft },
    { key: "ArrowRight", run: cursorVisibleCharRight },
    { key: "Shift-ArrowLeft", run: selectVisibleCharLeft },
    { key: "Shift-ArrowRight", run: selectVisibleCharRight },
  ]),
);
