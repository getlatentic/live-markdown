/**
 * Ranges kept up to date by the blocks around each edit are the ranges a
 * fresh read of the document gives, after any run of edits.
 */
import { type Range, RangeValue, StateField, type RangeSet } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { parsed, parsedState, randomEdit, SAMPLE, seeded } from "./randomEdits";
import { nodesNamed, readAfter, readAll } from "./treeRanges";

class Text extends RangeValue {
  constructor(readonly text: string) {
    super();
  }
}

/** Every node of one name, with its text: fences reach far, headings and
 *  paragraphs come and go with single characters. */
const fieldOf = (name: string) => {
  const reader = nodesNamed<Text>(name, (state, node): Range<Text>[] => (node.to > node.from ? [new Text(state.sliceDoc(node.from, node.to)).range(node.from, node.to)] : []));
  const field = StateField.define<RangeSet<Text>>({ create: (state) => readAll(state, reader), update: (value, tr) => readAfter(value, tr, reader) });
  return { reader, field };
};

function listed(set: RangeSet<Text>): string[] {
  const rows: string[] = [];
  for (const cursor = set.iter(); cursor.value; cursor.next()) rows.push(`${cursor.from}-${cursor.to} ${JSON.stringify(cursor.value.text)}`);
  return rows;
}

describe.each(["FencedCode", "Table", "Paragraph", "BulletList", "Blockquote", "ATXHeading2"])("%s nodes kept up to date by the blocks around each edit", (name) => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])("match a fresh read after every one of 300 random edits (seed %i)", (seed) => {
    const { reader, field } = fieldOf(name);
    const random = seeded(seed);
    let state = parsedState(SAMPLE, [field]);
    for (let step = 0; step < 300; step++) {
      const spec = randomEdit(state, random);
      state = parsed(state.update(spec).state).update({}).state;
      expect(listed(state.field(field)), `seed ${seed}, step ${step}: ${JSON.stringify(spec.changes)}\n${state.doc.toString()}`).toEqual(listed(readAll(state, reader)));
    }
  });
});
