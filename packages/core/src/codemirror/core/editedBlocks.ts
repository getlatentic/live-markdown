/**
 * Which part of a document an edit can have changed, for state that is kept
 * up to date edit by edit instead of read again from the whole document.
 *
 * What a line means depends on what stands above it, and that can reach far:
 * one new fence makes code of the text below it, and pairs every later fence
 * again. So the changed part is not "the blocks beside the edit". It is what
 * lies between two places where the tree before the edit and the tree after
 * it both start a top-level block. Markdown is read downward and a top-level
 * block starts with nothing open, so from such a place on, the same text
 * reads the same way: above the first one and below the second, nothing
 * changed.
 */
import { type syntaxTree } from "@codemirror/language";
import { type ChangeDesc, type Transaction } from "@codemirror/state";

type Tree = ReturnType<typeof syntaxTree>;

export interface Span {
  from: number;
  to: number;
}

/** The top-level block of `tree` that starts at `pos`, if one does. */
function blockStarting(tree: Tree, pos: number) {
  const block = tree.topNode.childAfter(pos);
  return block?.from === pos ? block : null;
}

/** The last top-level block that starts at or above `pos`. */
const blockAbove = (tree: Tree, pos: number) => tree.topNode.childBefore(pos + 1);

/** The start of the top-level block `pos` is in, or of the one above it. */
export const blockStartAt = (tree: Tree, pos: number): number => blockAbove(tree, pos)?.from ?? 0;

/** The last place at or above `pos` where both trees start the same kind of
 *  block. `back` maps a place in the document after the edit to the one
 *  before it. */
function sharedStartAbove(before: Tree, after: Tree, back: ChangeDesc, pos: number): number {
  for (let block = blockAbove(after, pos); block; block = block.prevSibling) {
    if (blockStarting(before, back.mapPos(block.from, -1))?.name === block.name) return block.from;
  }
  return 0;
}

/** The first place below `pos` where both trees start the same kind of
 *  block, or the end of what is parsed when they never meet again. */
function sharedStartBelow(before: Tree, after: Tree, back: ChangeDesc, pos: number): number {
  for (let block = after.topNode.childAfter(pos); block; block = block.nextSibling) {
    if (block.from > pos && blockStarting(before, back.mapPos(block.from, 1))?.name === block.name) return block.from;
  }
  return after.length;
}

export interface EditedBlocks {
  /** In the document before the edit. */
  old: Span;
  /** In the document after it. */
  now: Span;
}

/** For each edit of `tr`, the part of the document it can have changed. */
export function editedBlocks(tr: Transaction, before: Tree, after: Tree): EditedBlocks[] {
  const back = tr.changes.invertedDesc;
  const edited: EditedBlocks[] = [];
  tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    // Below the edit's last line: on that line the edit can have changed
    // the indent a block starts behind, and so what the block is.
    const below = tr.state.doc.lineAt(toB).to;
    const now = { from: sharedStartAbove(before, after, back, fromB), to: sharedStartBelow(before, after, back, below) };
    edited.push({ now, old: { from: back.mapPos(now.from, -1), to: back.mapPos(now.to, 1) } });
  });
  return edited;
}
