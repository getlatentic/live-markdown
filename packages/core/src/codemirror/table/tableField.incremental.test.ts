/**
 * The tables kept up to date edit by edit are the tables a fresh read of the
 * document gives, after any run of edits.
 */
import type { DecorationSet } from "@codemirror/view";
import { describe, expect, it } from "vitest";

import { parsed, parsedState, randomEdit, SAMPLE, seeded } from "../core/randomEdits";
import type { TableWidgetV2 } from "../tablev2/tableWidgetV2";
import { allTables, tableField } from "./tableField";

function listed(set: DecorationSet): string[] {
  const rows: string[] = [];
  set.between(0, Number.MAX_SAFE_INTEGER, (from, to, decoration) => {
    const widget = decoration.spec.widget as TableWidgetV2;
    // What is drawn and where; the positions a widget read its cells at go
    // stale by design, and are not part of what it draws.
    const shown = (cell: { html: string; from: number; to: number }): [string, number] => [cell.html, cell.to - cell.from];
    const { header, rows: body, alignments } = widget.data;
    rows.push(`${from}-${to} ${JSON.stringify([alignments, header.map(shown), body.map((row) => row.map(shown))])}`);
  });
  return rows;
}

describe("tables kept up to date by the blocks around each edit", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])("match a fresh read after every one of 400 random edits (seed %i)", (seed) => {
    const random = seeded(seed);
    let state = parsedState(SAMPLE, [tableField]);
    for (let step = 0; step < 400; step++) {
      const spec = randomEdit(state, random);
      state = parsed(state.update(spec).state);
      // The parse may finish after the edit: that is one more transaction.
      state = state.update({}).state;
      expect(listed(state.field(tableField)), `seed ${seed}, step ${step}: ${JSON.stringify(spec.changes)}\n${state.doc.toString()}`).toEqual(listed(allTables(state)));
    }
  });

  it("keeps the widget of a table the edit is not near", () => {
    const state = parsedState(SAMPLE, [tableField]);
    const first = listed(state.field(tableField))[0];
    const end = state.doc.length;
    const after = parsed(state.update({ changes: { from: end, insert: "x" } }).state);
    expect(listed(after.field(tableField))[0]).toBe(first);
    const widgets = (set: DecorationSet): unknown[] => {
      const found: unknown[] = [];
      set.between(0, 200, (_from, _to, decoration) => void found.push(decoration.spec.widget));
      return found;
    };
    expect(widgets(after.field(tableField))[0]).toBe(widgets(state.field(tableField))[0]);
  });
});
