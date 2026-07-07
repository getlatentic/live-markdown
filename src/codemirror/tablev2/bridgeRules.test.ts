/**
 * @pure tier (ADR 0001 §Testing): the bridge's key decisions as a pure
 * function — `(cell state, key) → action` — with zero DOM. Every boundary
 * cell of the feature spec (planned/table-editing.feature) is enumerated
 * here; the @browser tier only has to prove the wiring, not the math.
 */
import { describe, expect, it } from "vitest";

import { type BridgeAction, type BridgeInput, bridgeKey } from "./bridgeRules";

/** 3×2 grid (header + 2 body rows), single visual line, caret mid-text. */
function input(over: Partial<BridgeInput> = {}): BridgeInput {
  return {
    rows: 3,
    cols: 2,
    row: 1,
    col: 0,
    offset: 1,
    length: 3,
    onFirstVisualLine: true,
    onLastVisualLine: true,
    ...over,
  };
}

const native: BridgeAction = { kind: "native" };
const cell = (row: number, col: number, caret: "start" | "end"): BridgeAction => ({
  kind: "focusCell",
  row,
  col,
  caret,
});
const exit = (edge: "before" | "after"): BridgeAction => ({ kind: "exit", edge });

describe("bridgeKey — horizontal", () => {
  it("ArrowRight mid-text is native", () => {
    expect(bridgeKey(input({ offset: 1 }), "ArrowRight")).toEqual(native);
  });
  it("ArrowRight at the end targets the next cell's start", () => {
    expect(bridgeKey(input({ offset: 3 }), "ArrowRight")).toEqual(cell(1, 1, "start"));
  });
  it("ArrowRight at the end of the LAST cell exits after", () => {
    expect(bridgeKey(input({ row: 2, col: 1, offset: 3 }), "ArrowRight")).toEqual(exit("after"));
  });
  it("ArrowLeft mid-text is native", () => {
    expect(bridgeKey(input({ offset: 2 }), "ArrowLeft")).toEqual(native);
  });
  it("ArrowLeft at offset 0 targets the previous cell's end", () => {
    expect(bridgeKey(input({ col: 1, offset: 0 }), "ArrowLeft")).toEqual(cell(1, 0, "end"));
  });
  it("ArrowLeft at offset 0 wraps to the previous row's last cell", () => {
    expect(bridgeKey(input({ row: 2, col: 0, offset: 0 }), "ArrowLeft")).toEqual(cell(1, 1, "end"));
  });
  it("ArrowLeft at the very first cell's start exits before", () => {
    expect(bridgeKey(input({ row: 0, col: 0, offset: 0 }), "ArrowLeft")).toEqual(exit("before"));
  });
});

describe("bridgeKey — vertical", () => {
  it("ArrowDown on a wrapped cell's inner line is native", () => {
    expect(bridgeKey(input({ onLastVisualLine: false }), "ArrowDown")).toEqual(native);
  });
  it("ArrowDown targets the cell below in the same column", () => {
    expect(bridgeKey(input({ row: 1, col: 1 }), "ArrowDown")).toEqual(cell(2, 1, "start"));
  });
  it("ArrowDown from the last row exits after", () => {
    expect(bridgeKey(input({ row: 2 }), "ArrowDown")).toEqual(exit("after"));
  });
  it("ArrowUp on a wrapped cell's inner line is native", () => {
    expect(bridgeKey(input({ onFirstVisualLine: false }), "ArrowUp")).toEqual(native);
  });
  it("ArrowUp targets the cell above", () => {
    expect(bridgeKey(input({ row: 1 }), "ArrowUp")).toEqual(cell(0, 0, "start"));
  });
  it("ArrowUp from the header exits before", () => {
    expect(bridgeKey(input({ row: 0 }), "ArrowUp")).toEqual(exit("before"));
  });
});

describe("bridgeKey — Tab", () => {
  it("Tab targets the next cell regardless of caret position", () => {
    expect(bridgeKey(input({ offset: 1 }), "Tab")).toEqual(cell(1, 1, "start"));
  });
  it("Tab wraps to the next row", () => {
    expect(bridgeKey(input({ col: 1 }), "Tab")).toEqual(cell(2, 0, "start"));
  });
  it("Tab from the last cell exits after", () => {
    expect(bridgeKey(input({ row: 2, col: 1 }), "Tab")).toEqual(exit("after"));
  });
  it("Shift-Tab targets the previous cell's end", () => {
    expect(bridgeKey(input({ col: 1 }), "Shift-Tab")).toEqual(cell(1, 0, "end"));
  });
  it("Shift-Tab from the first cell exits before", () => {
    expect(bridgeKey(input({ row: 0, col: 0 }), "Shift-Tab")).toEqual(exit("before"));
  });
});

describe("bridgeKey — Backspace / Delete (structure is never merged)", () => {
  it("Backspace mid-text is native", () => {
    expect(bridgeKey(input({ offset: 2 }), "Backspace")).toEqual(native);
  });
  it("Backspace at offset 0 moves to the previous cell's end, no merge", () => {
    expect(bridgeKey(input({ col: 1, offset: 0 }), "Backspace")).toEqual(cell(1, 0, "end"));
  });
  it("Backspace at the first cell's offset 0 exits before", () => {
    expect(bridgeKey(input({ row: 0, col: 0, offset: 0 }), "Backspace")).toEqual(exit("before"));
  });
  it("Delete mid-text is native", () => {
    expect(bridgeKey(input({ offset: 1 }), "Delete")).toEqual(native);
  });
  it("Delete at the end moves to the next cell's start", () => {
    expect(bridgeKey(input({ offset: 3 }), "Delete")).toEqual(cell(1, 1, "start"));
  });
  it("Delete at the last cell's end exits after", () => {
    expect(bridgeKey(input({ row: 2, col: 1, offset: 3 }), "Delete")).toEqual(exit("after"));
  });
});

describe("bridgeKey — Enter", () => {
  it("Enter moves down a row (spreadsheet convention), never a newline", () => {
    expect(bridgeKey(input(), "Enter")).toEqual(cell(2, 0, "start"));
  });
  it("Enter on the last row exits after", () => {
    expect(bridgeKey(input({ row: 2 }), "Enter")).toEqual(exit("after"));
  });
});

describe("bridgeKey — everything else is native", () => {
  it("plain characters and unknown keys pass through", () => {
    expect(bridgeKey(input(), "a" as never)).toEqual(native);
  });
});
