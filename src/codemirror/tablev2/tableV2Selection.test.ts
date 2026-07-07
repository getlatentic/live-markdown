/**
 * @pure tier: cell-selection rectangle math (feature scenarios 11–13). The
 * painting/copy controller is @browser; the math never needs a DOM.
 */
import { describe, expect, it } from "vitest";

import { columnRect, rectOf, refsIn, rowRect, tableRect } from "./tableV2Selection";

describe("selection rectangles", () => {
  it("normalises any two corners", () => {
    expect(rectOf({ row: 2, col: 1 }, { row: 1, col: 0 })).toEqual({ r0: 1, c0: 0, r1: 2, c1: 1 });
  });

  it("enumerates cells row-major", () => {
    expect(refsIn({ r0: 1, c0: 0, r1: 2, c1: 1 })).toEqual([
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 2, col: 0 },
      { row: 2, col: 1 },
    ]);
  });

  it("select-column resolves to every cell in that column (scenario 13)", () => {
    expect(refsIn(columnRect(3, 1))).toEqual([
      { row: 0, col: 1 },
      { row: 1, col: 1 },
      { row: 2, col: 1 },
    ]);
  });

  it("select-row resolves to every cell in that row", () => {
    expect(refsIn(rowRect(2, 2))).toEqual([
      { row: 2, col: 0 },
      { row: 2, col: 1 },
    ]);
  });

  it("select-table covers the grid", () => {
    expect(refsIn(tableRect(3, 2))).toHaveLength(6);
  });
});
