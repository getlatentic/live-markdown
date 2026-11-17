/**
 * Fence walls for deletion (interaction-spec §12.1–.3).
 *
 * Fence lines are structure, not text: a character-level join that merges a
 * fence line with its neighbor corrupts the pair — content becomes the
 * opener's invisible info string, or the closer gains trailing text and
 * stops closing, re-pairing the opener with a later fence and swallowing
 * unrelated content. The delete normalizer consults these guards whenever a
 * Backspace/Delete would cross a line boundary; they answer with the §12
 * behavior (wall, park, plain code-line join, or whole-block deletion) and
 * report whether they handled the press.
 */

import { EditorSelection, type EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import { fenceAt } from "./fenceAutoClose";

interface BlockInfo {
  openerLine: { number: number; to: number };
  closerLine: { number: number; from: number } | null;
  /** First/last content positions (line-granular). */
  contentFrom: number;
  contentTo: number;
  contentEmpty: boolean;
}

type FenceNode = NonNullable<ReturnType<typeof fenceAt>>;

function blockInfo(state: EditorState, node: FenceNode): BlockInfo {
  const marks = node.getChildren("CodeMark");
  const openerLine = state.doc.lineAt(node.from);
  const closerMark = marks.length >= 2 ? marks[marks.length - 1] : null;
  const closerLine = closerMark ? state.doc.lineAt(closerMark.from) : null;
  const contentFrom = Math.min(openerLine.to + 1, node.to);
  const contentTo = closerLine ? Math.max(closerLine.from - 1, contentFrom) : node.to;
  const contentEmpty =
    !closerLine ||
    contentFrom >= closerLine.from ||
    state.doc.sliceString(contentFrom, contentTo).trim() === "";
  return { openerLine, closerLine, contentFrom, contentTo, contentEmpty };
}

function park(view: EditorView, pos: number): true {
  view.dispatch({
    selection: EditorSelection.cursor(pos),
    scrollIntoView: true,
    userEvent: "select",
  });
  return true;
}

function deleteWholeBlock(view: EditorView, node: FenceNode, userEvent: string): true {
  const docLen = view.state.doc.length;
  // Take one bounding newline with the block so no empty line is left behind.
  const to = node.to < docLen ? node.to + 1 : node.to;
  const from = node.to >= docLen && node.from > 0 ? node.from - 1 : node.from;
  view.dispatch({
    changes: { from, to, insert: "" },
    selection: EditorSelection.cursor(from),
    scrollIntoView: true,
    userEvent,
  });
  return true;
}

function joinNewline(view: EditorView, at: number, userEvent: string): true {
  view.dispatch({
    changes: { from: at, to: at + 1, insert: "" },
    selection: EditorSelection.cursor(at),
    scrollIntoView: true,
    userEvent,
  });
  return true;
}

/** Backspace whose deletion would cross upward out of `line`. True when the
 * press was handled (edit, park, or deliberate wall no-op). */
export function fenceBackspaceGuard(view: EditorView, pos: number): boolean {
  const { state } = view;
  const line = state.doc.lineAt(pos);
  if (line.from === 0) return false;
  const prevLine = state.doc.lineAt(line.from - 1);

  const inside = fenceAt(state, pos);
  if (inside) {
    const info = blockInfo(state, inside);
    if (line.number === info.openerLine.number) {
      // Caret on the opener line: joining it onto the prose above dissolves
      // the fence. Move up instead.
      return park(view, prevLine.to);
    }
    if (info.closerLine && line.number === info.closerLine.number) {
      // Caret on the closer line: pulling it up corrupts the pair.
      return park(view, prevLine.to);
    }
    if (prevLine.number === info.openerLine.number) {
      // §12.1 — first content line: the wall is solid; an effectively empty
      // block collapses whole instead.
      if (info.contentEmpty) return deleteWholeBlock(view, inside, "delete.backward");
      return true;
    }
    // Interior code lines join plainly — never through blockPrefixLength,
    // which would eat code that merely looks like a list marker.
    return joinNewline(view, line.from - 1, "delete.backward");
  }

  const prevFence = fenceAt(state, prevLine.to);
  if (prevFence) {
    const info = blockInfo(state, prevFence);
    if (info.closerLine && prevLine.number === info.closerLine.number) {
      // §12.2 — approaching from below: park at the content end (or collapse
      // an empty block whole).
      if (info.contentEmpty) return deleteWholeBlock(view, prevFence, "delete.backward");
      return park(view, info.contentTo);
    }
  }
  return false;
}

/** Forward-delete whose deletion would cross downward out of `line`. */
export function fenceDeleteGuard(view: EditorView, pos: number): boolean {
  const { state } = view;
  const line = state.doc.lineAt(pos);
  if (line.to >= state.doc.length) return false;
  const nextLine = state.doc.lineAt(line.to + 1);

  const inside = fenceAt(state, pos);
  if (inside) {
    const info = blockInfo(state, inside);
    if (line.number === info.openerLine.number) {
      // Caret on the opener: pulling content up makes it the invisible info
      // string. Step into the block instead.
      return park(view, nextLine.from);
    }
    if (info.closerLine && line.number === info.closerLine.number) {
      return park(view, nextLine.from);
    }
    if (info.closerLine && nextLine.number === info.closerLine.number) {
      // §12.1 mirror — last content line.
      if (info.contentEmpty) return deleteWholeBlock(view, inside, "delete.forward");
      return true;
    }
    return joinNewline(view, line.to, "delete.forward");
  }

  const nextFence = fenceAt(state, Math.min(nextLine.to, state.doc.length));
  if (nextFence && state.doc.lineAt(nextFence.from).number === nextLine.number) {
    const info = blockInfo(state, nextFence);
    // §12.2 mirror — approaching from above: park at the content start.
    if (info.contentEmpty) return deleteWholeBlock(view, nextFence, "delete.forward");
    return park(view, info.contentFrom);
  }
  return false;
}
