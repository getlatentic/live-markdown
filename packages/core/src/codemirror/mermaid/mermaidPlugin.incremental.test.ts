/**
 * The diagram fences kept up to date edit by edit are the fences a fresh
 * read of the document gives, after any run of edits.
 */
import { EditorSelection, type EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { parsed, parsedState, randomEdit, SAMPLE, seeded } from "../core/randomEdits";
import { mermaidField } from "./mermaidPlugin";

function listed(state: EditorState): string[] {
  const rows: string[] = [];
  for (const cursor = state.field(mermaidField).fences.iter(); cursor.value; cursor.next()) rows.push(`${cursor.from}-${cursor.to} ${JSON.stringify(cursor.value.source)}`);
  return rows;
}

describe("diagram fences kept up to date by the blocks around each edit", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])("match a fresh read after every one of 400 random edits (seed %i)", (seed) => {
    const random = seeded(seed);
    let state = parsedState(SAMPLE, [mermaidField]);
    for (let step = 0; step < 400; step++) {
      const spec = randomEdit(state, random);
      state = parsed(state.update({ ...spec, selection: EditorSelection.cursor(0) }).state).update({}).state;
      const fresh = parsedState(state.doc.toString(), [mermaidField]);
      expect(listed(state), `seed ${seed}, step ${step}: ${JSON.stringify(spec.changes)}\n${state.doc.toString()}`).toEqual(listed(fresh));
    }
  });
});
