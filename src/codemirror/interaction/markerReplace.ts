/**
 * A marker typed in front of a line's own marker replaces it: `# ` at the
 * start of a bullet's text makes the line a heading, `- ` at the start of a
 * heading's text makes it a bullet. Left as typed, the second marker is
 * literal text or a block nested inside the first (`- # text`).
 *
 * The same kind typed again is left alone, except a heading's level.
 */

import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { lineStructure, type LineStructure } from "../core/lineStructure";

type Kind = "heading" | "bullet" | "ordered" | "quote";

function kindOf(marker: string): Kind | null {
  if (/^#{1,6}$/.test(marker)) return "heading";
  if (/^[-*+]$/.test(marker)) return "bullet";
  if (/^\d+[.)]$/.test(marker)) return "ordered";
  return marker === ">" ? "quote" : null;
}

function replaces(typed: Kind, structure: LineStructure): boolean {
  if (structure.list) return structure.list.task || typed !== structure.list.kind;
  return structure.heading !== null;
}

export const markerReplace = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== " " || from !== to) return false;
  const { state } = view;
  const structure = lineStructure(state, state.doc.lineAt(from));
  const own = structure.list ?? structure.heading;
  if (!own || structure.inCode || from <= own.markTo) return false;
  const marker = state.sliceDoc(own.markTo, from);
  const typed = kindOf(marker);
  if (!typed || !replaces(typed, structure)) return false;
  view.dispatch({
    changes: { from: own.markFrom, to: from, insert: `${marker} ` },
    selection: EditorSelection.cursor(own.markFrom + marker.length + 1),
    userEvent: "input.type",
    scrollIntoView: true,
  });
  return true;
});
