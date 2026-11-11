/**
 * A line split in front of a space starts its second half without the space.
 *
 * Enter is handled by several rules (lists, quotes, headings, plain text).
 * The plain one drops the space after the caret; the others kept it, so the
 * new line of a list item or a quote began with a stray space. This filter
 * applies the one rule to all of them.
 */

import { EditorState, Transaction, type ChangeSpec } from "@codemirror/state";

import { lineStructure } from "../core/lineStructure";

export const splitDropsSpace = EditorState.transactionFilter.of((tr: Transaction) => {
  if (!tr.docChanged || tr.annotation(Transaction.userEvent) !== "input") return tr;
  const dropped: ChangeSpec[] = [];
  tr.changes.iterChanges((fromA, _toA, _fromB, toB, inserted) => {
    if (!inserted.toString().includes("\n")) return;
    const line = tr.startState.doc.lineAt(fromA);
    // Only a split in the middle of a line's text: code keeps its spaces, and
    // a line opened above another keeps that line's indent.
    if (tr.startState.sliceDoc(line.from, fromA).trim() === "" || lineStructure(tr.startState, line).inCode) return;
    const rest = tr.newDoc.lineAt(toB);
    const spaces = /^[ \t]+(?=\S)/.exec(tr.newDoc.sliceString(toB, rest.to))?.[0].length ?? 0;
    if (spaces > 0) dropped.push({ from: toB, to: toB + spaces });
  });
  return dropped.length === 0 ? tr : [tr, { changes: dropped, sequential: true }];
});
