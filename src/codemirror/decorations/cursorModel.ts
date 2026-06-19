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
import { type Command, EditorView, keymap } from "@codemirror/view";

import { markdownDecorationsPlugin } from "./plugin";

function previousVisiblePosition(view: EditorView, pos: number): number {
  if (pos <= 0) return 0;
  const atomic = view.plugin(markdownDecorationsPlugin)?.atomic;
  if (!atomic) return pos - 1;
  let p = pos - 1;
  // CM6's `RangeSet.between(p, p, …)` fires the callback for any range
  // whose `[from, to]` *touches* the point — including boundary cases.
  // For a caret "inside" semantic we need STRICT inclusion: a position
  // at a range's `from` or `to` is at the boundary, not inside, and the
  // caret should be allowed to stop there.
  while (p > 0) {
    let containingFrom = -1;
    atomic.between(p, p, (from, to) => {
      if (from < p && p < to) {
        containingFrom = from;
        return false;
      }
    });
    if (containingFrom >= 0) {
      p = containingFrom - 1;
    } else {
      return p;
    }
  }
  return 0;
}

function nextVisiblePosition(view: EditorView, pos: number): number {
  const docLen = view.state.doc.length;
  if (pos >= docLen) return docLen;
  const atomic = view.plugin(markdownDecorationsPlugin)?.atomic;
  if (!atomic) return pos + 1;
  let p = pos + 1;
  while (p < docLen) {
    let containingTo = -1;
    atomic.between(p, p, (from, to) => {
      if (from < p && p < to) {
        containingTo = to;
        return false;
      }
    });
    if (containingTo >= 0) {
      p = containingTo + 1;
    } else {
      return p;
    }
  }
  return docLen;
}

const cursorVisibleCharLeft: Command = (view) => {
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

const cursorVisibleCharRight: Command = (view) => {
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

const selectVisibleCharLeft: Command = (view) => {
  const main = view.state.selection.main;
  view.dispatch({
    selection: EditorSelection.range(main.anchor, previousVisiblePosition(view, main.head)),
    userEvent: "select.extend",
    scrollIntoView: true,
  });
  return true;
};

const selectVisibleCharRight: Command = (view) => {
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
