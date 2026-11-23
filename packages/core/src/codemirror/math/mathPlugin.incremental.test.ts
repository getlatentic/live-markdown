/**
 * The math kept up to date edit by edit is the math a fresh read of the
 * document gives, after any run of edits.
 */
import type { DecorationSet } from "@codemirror/view";
import { describe, expect, it } from "vitest";

import { parsed, parsedState, randomEdit, SAMPLE, seeded } from "../core/randomEdits";
import { computeDecorations, mathPlugin } from "./mathPlugin";
import type { MathWidget } from "./mathWidget";

function listed(set: DecorationSet): string[] {
  const rows: string[] = [];
  set.between(0, Number.MAX_SAFE_INTEGER, (from, to, decoration) => {
    const widget = decoration.spec.widget as MathWidget;
    rows.push(`${from}-${to} ${JSON.stringify(widget)}`);
  });
  return rows;
}

describe("math kept up to date by the lines an edit touches", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])("matches a fresh read after every one of 400 random edits (seed %i)", (seed) => {
    const random = seeded(seed);
    let state = parsedState(SAMPLE, [mathPlugin]);
    for (let step = 0; step < 400; step++) {
      const spec = randomEdit(state, random);
      state = parsed(state.update(spec).state);
      const fresh = computeDecorations(state);
      const kept = state.field(mathPlugin);
      const where = `seed ${seed}, step ${step}: ${JSON.stringify(spec.changes)}\n${state.doc.toString()}`;
      expect(listed(kept.decorations), where).toEqual(listed(fresh.decorations));
      expect(listed(kept.atomic), where).toEqual(listed(fresh.atomic));
    }
  });

  it("keeps the math an edit is not near, and reads no line of it again", () => {
    const state = parsedState(SAMPLE, [mathPlugin]);
    const first = (set: DecorationSet): unknown => {
      let found: unknown = null;
      set.between(0, 60, (_from, _to, decoration) => void (found ??= decoration));
      return found;
    };
    const after = parsed(state.update({ changes: { from: state.doc.length, insert: "x" } }).state);
    expect(first(after.field(mathPlugin).decorations)).toBe(first(state.field(mathPlugin).decorations));
  });
});
