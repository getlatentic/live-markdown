import { describe, expect, it } from "vitest";

import { cellAt, positionOf, rowCount, stepCell } from "./tableCellNav";
import { type TableModel } from "./tableModel";

const cell = (from: number) => ({ html: "", from, to: from + 1 });

// 3 columns: a header row + two body rows. `from`s are arbitrary but unique.
const model: TableModel = {
  from: 0,
  to: 25,
  data: {
    header: [cell(0), cell(2), cell(4)],
    rows: [
      [cell(10), cell(12), cell(14)],
      [cell(20), cell(22), cell(24)],
    ],
    alignments: [null, null, null],
  },
};

describe("tableCellNav", () => {
  it("counts header + body rows", () => {
    expect(rowCount(model)).toBe(3);
  });

  it("positionOf maps a cell's `from` to (row, col); null when absent", () => {
    expect(positionOf(model, 12)).toEqual({ row: 1, col: 1 });
    expect(positionOf(model, 4)).toEqual({ row: 0, col: 2 });
    expect(positionOf(model, 99)).toBeNull();
  });

  it("cellAt reads the header at row 0 and body rows after", () => {
    expect(cellAt(model, 0, 2)?.from).toBe(4);
    expect(cellAt(model, 2, 0)?.from).toBe(20);
    expect(cellAt(model, 5, 0)).toBeNull();
  });

  it("next walks the row, wraps to the next, then exits after the table", () => {
    expect(stepCell(model, 0, 1, "next")).toEqual({ kind: "cell", row: 0, col: 2 });
    expect(stepCell(model, 0, 2, "next")).toEqual({ kind: "cell", row: 1, col: 0 });
    expect(stepCell(model, 2, 2, "next")).toEqual({ kind: "exit", edge: "after" });
  });

  it("prev walks back, wraps to the previous row, then exits before", () => {
    expect(stepCell(model, 1, 0, "prev")).toEqual({ kind: "cell", row: 0, col: 2 });
    expect(stepCell(model, 0, 0, "prev")).toEqual({ kind: "exit", edge: "before" });
  });

  it("down/up keep the column and exit at the table's vertical edges", () => {
    expect(stepCell(model, 0, 1, "down")).toEqual({ kind: "cell", row: 1, col: 1 });
    expect(stepCell(model, 2, 1, "down")).toEqual({ kind: "exit", edge: "below" });
    expect(stepCell(model, 0, 1, "up")).toEqual({ kind: "exit", edge: "above" });
    expect(stepCell(model, 1, 1, "up")).toEqual({ kind: "cell", row: 0, col: 1 });
  });
});
