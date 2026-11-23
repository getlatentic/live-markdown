import { type EditorState, type Line, type Range, StateField, type Text, type Transaction } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

import { docTree, inCode } from "../core/codeContext";
import { editedBlocks, type Span } from "../core/editedBlocks";
import { MathWidget } from "./mathWidget";

export const INLINE_MATH_RE = /(?<![\\$])\$(?!\s)([^\n$]+?)(?<!\s)\$(?!\d)/g;

type Tree = ReturnType<typeof docTree>;
type Marks = { decorations: DecorationSet; atomic: DecorationSet };

const widgetOver = (tex: string, display: boolean, block = false): Decoration => Decoration.replace({ widget: new MathWidget(tex, display), ...(block ? { block: true } : {}) });

/** A lone `$$` line opens or closes a block only in prose: inside a code
 *  block it is literal text. */
const isBlockMark = (tree: Tree, line: Line): boolean => line.text.trim() === "$$" && !inCode(tree, line.from + line.text.indexOf("$"));

/** The math of one line: `$$ … $$` filling it, or `$ … $` in its text. */
function lineMath(tree: Tree, line: Line): Range<Decoration>[] {
  const single = line.text.match(/^\$\$(.+)\$\$\s*$/);
  if (single && !inCode(tree, line.from)) return [widgetOver(single[1], true).range(line.from, line.to)];
  const found: Range<Decoration>[] = [];
  INLINE_MATH_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_MATH_RE.exec(line.text)) !== null) {
    const from = line.from + m.index;
    const to = from + m[0].length;
    if (inCode(tree, from) || inCode(tree, to - 1)) continue;
    found.push(widgetOver(m[1], false).range(from, to));
  }
  return found;
}

/** The number of the lone `$$` line that closes the block `open` opens, or
 *  null when none does. */
function closingMark(doc: Text, tree: Tree, open: number): number | null {
  for (let number = open + 1; number <= doc.lines; number++) {
    if (isBlockMark(tree, doc.line(number))) return number;
  }
  return null;
}

const marks = (ranges: Range<Decoration>[]): Marks => {
  const set = Decoration.set(ranges, true);
  return { decorations: set, atomic: set };
};

export function computeDecorations(state: EditorState): Marks {
  const ranges: Range<Decoration>[] = [];
  const doc = state.doc;
  const tree = docTree(state);
  for (let number = 1; number <= doc.lines; number++) {
    const line = doc.line(number);
    // A block crosses line breaks, so it must be a `block: true` replacement
    // and is delivered via a StateField: CM6 forbids a plugin-supplied or a
    // non-block replace from covering a line break.
    const close = isBlockMark(tree, line) && !/^\$\$(.+)\$\$\s*$/.test(line.text) ? closingMark(doc, tree, number) : null;
    if (close !== null) {
      const closeLine = doc.line(close);
      ranges.push(widgetOver(doc.sliceString(line.to, closeLine.from).trim(), true, true).range(line.from, closeLine.to));
      number = close;
      continue;
    }
    ranges.push(...lineMath(tree, line));
  }
  return marks(ranges);
}

/** A line of `[from, to]` is a lone `$$`: it may open or close a block, and
 *  that pairs every `$$` below it again. */
function holdsBlockMark(doc: Text, { from, to }: Span): boolean {
  const last = doc.lineAt(Math.min(to, doc.length)).number;
  for (let number = doc.lineAt(Math.min(from, doc.length)).number; number <= last; number++) {
    if (doc.line(number).text.trim() === "$$") return true;
  }
  return false;
}

/**
 * Math after a transaction, from the math before it. Reading the whole
 * document again on every key costs time in step with its length, so only
 * the lines of the blocks around the edit are read again (`editedBlocks`).
 * Blocks of `$$` pair from the top of the document, so an edit that touches
 * one, or a lone `$$`, reads everything again.
 */
function mathAfter(value: Marks, tr: Transaction): Marks {
  if (!tr.docChanged) return value;
  const doc = tr.state.doc;
  const tree = docTree(tr.state);
  const edited = editedBlocks(tr, docTree(tr.startState), tree);
  let kept = value.decorations.map(tr.changes);
  for (const { old, now } of edited) {
    const from = doc.lineAt(now.from).from;
    const to = doc.lineAt(Math.min(now.to, doc.length)).to;
    let inBlock = false;
    kept.between(from, to, (_from, _to, decoration) => void (inBlock ||= decoration.spec.block === true));
    if (inBlock || tree.length < to || holdsBlockMark(tr.startState.doc, old) || holdsBlockMark(doc, now)) return computeDecorations(tr.state);
    const read: Range<Decoration>[] = [];
    for (let number = doc.lineAt(from).number; number <= doc.lineAt(to).number; number++) read.push(...lineMath(tree, doc.line(number)));
    kept = kept.update({ filterFrom: from, filterTo: to, filter: (rangeFrom, rangeTo) => rangeTo < from || rangeFrom > to, add: read, sort: true });
  }
  return { decorations: kept, atomic: kept };
}

export const mathPlugin = StateField.define<Marks>({
  create: (state) => computeDecorations(state),
  update: mathAfter,
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.decorations),
    EditorView.atomicRanges.of((view) => view.state.field(field, false)?.atomic ?? Decoration.none),
  ],
});
