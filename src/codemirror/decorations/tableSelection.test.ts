// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { clearCellSelection, selectCellRect, selectionTsv } from "./tableSelection";

// rows: 0 = header (A,B,C), 1 = (1,2,3), 2 = (4,5,6); cols: 0,1,2
const TABLE = `<table class="cm-table-widget">
  <thead><tr><th>A</th><th>B</th><th>C</th></tr></thead>
  <tbody>
    <tr><td>1</td><td>2</td><td>3</td></tr>
    <tr><td>4</td><td>5</td><td>6</td></tr>
  </tbody></table>`;

function table(): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = TABLE;
  return root.querySelector("table")!;
}

function selected(t: HTMLElement): (string | null)[] {
  return [...t.querySelectorAll(".cm-table-cell--selected")].map((c) => c.textContent);
}

describe("tableSelection", () => {
  it("selectCellRect tints the rectangle between two corners", () => {
    const t = table();
    selectCellRect(t, { row: 1, col: 0 }, { row: 2, col: 1 });
    expect(selected(t)).toEqual(["1", "2", "4", "5"]);
  });

  it("highlights a full row — every cell, one even class", () => {
    const t = table();
    selectCellRect(t, { row: 1, col: 0 }, { row: 1, col: 2 });
    expect(selected(t)).toEqual(["1", "2", "3"]);
  });

  it("highlights a full column regardless of drag direction", () => {
    const t = table();
    selectCellRect(t, { row: 2, col: 1 }, { row: 0, col: 1 });
    expect(selected(t)).toEqual(["B", "2", "5"]);
  });

  it("re-selecting clears the previous rectangle", () => {
    const t = table();
    selectCellRect(t, { row: 1, col: 0 }, { row: 1, col: 2 });
    selectCellRect(t, { row: 2, col: 0 }, { row: 2, col: 0 });
    expect(selected(t)).toEqual(["4"]);
  });

  it("clearCellSelection removes every tint", () => {
    const t = table();
    selectCellRect(t, { row: 1, col: 0 }, { row: 2, col: 2 });
    clearCellSelection(t);
    expect(selected(t)).toEqual([]);
  });

  it("selectionTsv joins columns with tabs and rows with newlines", () => {
    const t = table();
    selectCellRect(t, { row: 1, col: 0 }, { row: 2, col: 1 });
    expect(selectionTsv(t)).toBe("1\t2\n4\t5");
  });
});
