/**
 * Deleting a word, or the rest of a line (⌥⌫ ⌥⌦ ⌘⌫ ⌘⌦ on a Mac; Ctrl with
 * Backspace or Delete elsewhere), by the rules single-character deletion keeps
 * (spec §8): the unit is visible text, hidden markers are never cut, a span
 * left empty goes whole, and the line's own marker — heading, bullet,
 * checkbox, quote — stays. CodeMirror's own commands work on the source text,
 * so a word beside a hidden `**` took half the marker pair with it.
 */

import { CharCategory, Prec, type EditorState, type Line } from "@codemirror/state";
import { type Command, type EditorView, keymap } from "@codemirror/view";

import { lineStructure } from "../core/lineStructure";
import { deleteVisible, visibleBackspace, visibleDeleteForward, type TextRange } from "./deleteNormalizer";
import { visibleCharAfter, visibleCharBefore } from "./visiblePosition";

type Direction = "backward" | "forward";

/** Where the line's own text starts, after its indentation and markers. */
function textStart(state: EditorState, line: Line): number {
  const structure = lineStructure(state, line);
  return Math.max(structure.contentFrom, structure.list?.markTo ?? 0, structure.heading?.markTo ?? 0);
}

/** The line's visible characters from the caret outward, nearest first. */
function visibleChars(view: EditorView, pos: number, direction: Direction): TextRange[] {
  const line = view.state.doc.lineAt(pos);
  const floor = textStart(view.state, line);
  const chars: TextRange[] = [];
  for (let at = pos; ; ) {
    const char = direction === "backward" ? visibleCharBefore(view, at) : visibleCharAfter(view, at);
    if (!char || char.from < floor || char.to > line.to) return chars;
    chars.push(char);
    at = direction === "backward" ? char.from : char.to;
  }
}

/** The spaces nearest the caret, then one run of word or punctuation characters. */
function oneWord(state: EditorState, pos: number, chars: TextRange[]): TextRange[] {
  const category = state.charCategorizer(pos);
  const kinds = chars.map((char) => category(state.sliceDoc(char.from, char.to)));
  const first = kinds.findIndex((kind) => kind !== CharCategory.Space);
  if (first < 0) return chars;
  let end = first;
  while (end < chars.length && kinds[end] === kinds[first]) end += 1;
  return chars.slice(0, end);
}

/** With nothing of the line left to take, the key does what the plain one does: its marker, or the join. */
function deleting(direction: Direction, unit: "word" | "line"): Command {
  const plain = direction === "backward" ? visibleBackspace : visibleDeleteForward;
  return (view) => {
    const { main } = view.state.selection;
    if (!main.empty) return plain(view);
    const chars = visibleChars(view, main.head, direction);
    if (chars.length === 0) return plain(view);
    return deleteVisible(view, unit === "word" ? oneWord(view.state, main.head, chars) : chars, direction);
  };
}

export const deleteWordBackward = deleting("backward", "word");
export const deleteWordForward = deleting("forward", "word");
export const deleteLineBackward = deleting("backward", "line");
export const deleteLineForward = deleting("forward", "line");

export const groupDeleteKeymap = Prec.high(
  keymap.of([
    { key: "Mod-Backspace", mac: "Alt-Backspace", run: deleteWordBackward },
    { key: "Mod-Delete", mac: "Alt-Delete", run: deleteWordForward },
    { mac: "Mod-Backspace", run: deleteLineBackward },
    { mac: "Mod-Delete", run: deleteLineForward },
    { mac: "Ctrl-k", run: deleteLineForward },
  ]),
);
