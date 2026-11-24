/**
 * Ranges read off the syntax tree (tables, diagrams, code blocks), kept up
 * to date edit by edit. Reading the whole tree again on every key costs time
 * in step with the document's length; here only the part an edit can have
 * changed is read again (`editedBlocks`), and the rest moves with the text.
 */
import { syntaxTree } from "@codemirror/language";
import { type EditorState, type Range, RangeSet, type RangeValue, type Transaction } from "@codemirror/state";

import { blockStartAt, editedBlocks, type Span } from "./editedBlocks";

type Tree = ReturnType<typeof syntaxTree>;

/** What a reader found in a span, and the span widened to the nodes it
 *  read whole: what stood there before is replaced by what was found. */
export interface Found<T extends RangeValue> {
  ranges: Range<T>[];
  span: Span;
}

export type Reader<T extends RangeValue> = (state: EditorState, tree: Tree, span: Span) => Found<T>;

/** Everything `read` finds in the document, as far as it is parsed. */
export function readAll<T extends RangeValue>(state: EditorState, read: Reader<T>): RangeSet<T> {
  const tree = syntaxTree(state);
  return RangeSet.of(read(state, tree, { from: 0, to: tree.length }).ranges, true);
}

/** What a transaction may have changed: the blocks around each edit, and
 *  whatever the parser newly reached. Null when the tree changed in a way
 *  neither of those explains. */
function changedSpans(tr: Transaction, before: Tree, after: Tree): Span[] | null {
  const spans = editedBlocks(tr, before, after).map(({ now }) => now);
  // CodeMirror parses lazily: on a long document what lies below the parsed
  // region enters the tree only as the parser moves on.
  const stood = tr.changes.mapPos(Math.min(before.length, tr.startState.doc.length), -1);
  if (after.length > stood) spans.push({ from: blockStartAt(after, stood), to: after.length });
  else if (!tr.docChanged) return null;
  return spans;
}

/** `value` after `tr`: unchanged when neither the text nor the tree changed. */
export function readAfter<T extends RangeValue>(value: RangeSet<T>, tr: Transaction, read: Reader<T>): RangeSet<T> {
  const before = syntaxTree(tr.startState);
  const after = syntaxTree(tr.state);
  if (!tr.docChanged && before === after) return value;
  const spans = changedSpans(tr, before, after);
  if (!spans) return readAll(tr.state, read);
  let ranges = tr.docChanged ? value.map(tr.changes) : value;
  for (const span of spans) {
    const found = read(tr.state, after, span);
    const { from, to } = found.span;
    ranges = ranges.update({ filterFrom: from, filterTo: to, filter: (rangeFrom, rangeTo) => rangeTo < from || rangeFrom > to, add: found.ranges, sort: true });
  }
  return ranges;
}

/** A reader of the nodes named `name`: each gives its ranges, and is read
 *  whole, so the span widens to it. */
export function nodesNamed<T extends RangeValue>(name: string, rangesOf: (state: EditorState, node: ReturnType<Tree["resolveInner"]>) => Range<T>[]): Reader<T> {
  return (state, tree, span) => {
    const ranges: Range<T>[] = [];
    const widened = { ...span };
    tree.iterate({
      from: span.from,
      to: span.to,
      enter(node) {
        if (node.name !== name) return;
        widened.from = Math.min(widened.from, node.from);
        widened.to = Math.max(widened.to, node.to);
        ranges.push(...rangesOf(state, node.node));
        return false;
      },
    });
    return { ranges, span: widened };
  };
}
