import { describe, expect, it } from "vitest";

import type { TableCellData, TableData } from "../decorations/tableModel";
import { estimateTableHeight } from "./tableWidgetV2";

function cell(chars: number): TableCellData {
  return { html: "x".repeat(chars), from: 0, to: chars };
}

function table(rows: number[][]): TableData {
  return {
    header: rows[0].map(cell),
    alignments: rows[0].map(() => null),
    rows: rows.slice(1).map((row) => row.map(cell)),
  };
}

describe("estimateTableHeight", () => {
  it("keeps the one-line baseline for short-celled tables", () => {
    const compact = table([
      [6, 6, 6],
      [8, 4, 10],
      [8, 4, 10],
    ]);
    // Two single-line body rows + header chrome.
    expect(estimateTableHeight(compact)).toBe(30 + 2 * 28);
  });

  it("scales with wrapped prose rows instead of assuming one line each", () => {
    // The shape that surfaced the scroll-jump: a differentiation table whose
    // rows carry ~200 chars of prose. One line per row put the estimate 3-5×
    // under reality, so everything below sat hundreds of px off until
    // measured — and the correction landed mid-selection.
    const prose = table([
      [10, 10],
      [30, 160],
      [30, 160],
      [30, 160],
      [30, 160],
      [30, 160],
      [30, 160],
      [30, 160],
      [30, 160],
    ]);
    const estimate = estimateTableHeight(prose);
    const oneLinePerRow = 30 + 8 * 28;
    // ~190 chars/row wraps to ≥3 lines at any plausible panel width.
    expect(estimate).toBeGreaterThanOrEqual(30 + 8 * 3 * 28);
    expect(estimate).toBeGreaterThan(oneLinePerRow * 2);
  });

  it("never goes below one line per row", () => {
    const sparse = table([
      [1, 1],
      [1, 1],
    ]);
    expect(estimateTableHeight(sparse)).toBe(30 + 28);
  });
});
