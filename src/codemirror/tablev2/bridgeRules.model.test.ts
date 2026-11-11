/**
 * The keys inside a table, as a machine of its own: every cell of a grid,
 * the caret at each place in it, each key. The rules are compared with the
 * table in `model/table-keys.tsv`, and checked as a whole: the keys walk the
 * grid without leaving a cell out, and a step can be taken back.
 */
import { describe, expect, it } from "vitest";

import { bridgeKey, type BridgeAction, type BridgeInput, type BridgeKey } from "./bridgeRules";

const ROWS = 3;
const COLS = 3;
const LENGTH = 4;

const KEYS: BridgeKey[] = ["Tab", "Shift-Tab", "ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Backspace", "Delete", "Enter"];

/** Where the caret is in the cell's text. */
const CARETS = { start: 0, middle: 2, end: LENGTH } as const;
type Caret = keyof typeof CARETS;

/** Which line of a cell's wrapped text the caret is on. */
const LINES = {
  "one line": { onFirstVisualLine: true, onLastVisualLine: true },
  "first line": { onFirstVisualLine: true, onLastVisualLine: false },
  "inner line": { onFirstVisualLine: false, onLastVisualLine: false },
  "last line": { onFirstVisualLine: false, onLastVisualLine: true },
} as const;
type Lines = keyof typeof LINES;

interface State {
  row: number;
  col: number;
  caret: Caret;
  lines: Lines;
}

const input = ({ row, col, caret, lines }: State): BridgeInput => ({ rows: ROWS, cols: COLS, row, col, offset: CARETS[caret], length: LENGTH, ...LINES[lines] });

const STATES: State[] = [];
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    for (const caret of Object.keys(CARETS) as Caret[]) {
      for (const lines of Object.keys(LINES) as Lines[]) STATES.push({ row, col, caret, lines });
    }
  }
}

const ROW_NAMES = ["header", "body", "last"];
const COL_NAMES = ["first", "inner", "last"];
const cellName = (row: number, col: number): string => `${ROW_NAMES[row]} row, ${COL_NAMES[col]} column`;

function shown(action: BridgeAction): string {
  if (action.kind === "native") return "the browser edits the text";
  if (action.kind === "exit") return `leaves the table, ${action.edge}`;
  return `to the ${action.caret} of ${cellName(action.row, action.col)}`;
}

/** The cell a key leads to from the start or end of `from`, or how it leaves. */
function step(from: { row: number; col: number }, key: BridgeKey, caret: Caret): BridgeAction {
  return bridgeKey(input({ ...from, caret, lines: "one line" }), key);
}

/** Every cell `key` visits from the first or last cell until it leaves the table. */
function walk(key: BridgeKey, caret: Caret, start: { row: number; col: number }): string[] {
  const seen: string[] = [];
  let action: BridgeAction = { kind: "focusCell", ...start, caret: "start" };
  while (action.kind === "focusCell" && seen.length <= ROWS * COLS) {
    seen.push(`${action.row},${action.col}`);
    action = step(action, key, caret);
  }
  return seen;
}

const EVERY_CELL = Array.from({ length: ROWS * COLS }, (_, i) => `${Math.floor(i / COLS)},${i % COLS}`);

describe("the keys inside a table", () => {
  it("do what the table says", async () => {
    const lines = STATES.flatMap((state) =>
      KEYS.map((key) => [key, cellName(state.row, state.col), state.caret, state.lines, shown(bridgeKey(input(state), key))].join("\t")),
    );
    await expect(`${["key", "cell", "caret", "lines", "outcome"].join("\t")}\n${lines.sort().join("\n")}\n`).toMatchFileSnapshot("../../../model/table-keys.tsv");
  });

  it("never join two cells: a key edits the text of its cell, or moves the caret", () => {
    for (const state of STATES) {
      for (const key of KEYS) expect(["native", "focusCell", "exit"]).toContain(bridgeKey(input(state), key).kind);
    }
  });

  it.each<[BridgeKey, Caret]>([
    ["Tab", "middle"],
    ["ArrowRight", "end"],
    ["Delete", "end"],
  ])("visit every cell in reading order with %s, then leave after the table", (key, caret) => {
    expect(walk(key, caret, { row: 0, col: 0 })).toEqual(EVERY_CELL);
    expect(step({ row: ROWS - 1, col: COLS - 1 }, key, caret)).toEqual({ kind: "exit", edge: "after" });
  });

  it.each<[BridgeKey, Caret]>([
    ["Shift-Tab", "middle"],
    ["ArrowLeft", "start"],
    ["Backspace", "start"],
  ])("visit every cell backward with %s, then leave before the table", (key, caret) => {
    expect(walk(key, caret, { row: ROWS - 1, col: COLS - 1 })).toEqual([...EVERY_CELL].reverse());
    expect(step({ row: 0, col: 0 }, key, caret)).toEqual({ kind: "exit", edge: "before" });
  });

  it.each<[BridgeKey, BridgeKey, Caret, Caret]>([
    ["Tab", "Shift-Tab", "middle", "middle"],
    ["ArrowRight", "ArrowLeft", "end", "start"],
    ["ArrowDown", "ArrowUp", "middle", "middle"],
    ["Enter", "ArrowUp", "middle", "middle"],
  ])("take back a step of %s with %s", (key, back, caret, backCaret) => {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const there = step({ row, col }, key, caret);
        if (there.kind !== "focusCell") continue;
        expect(step(there, back, backCaret), `${key} from ${cellName(row, col)}`).toMatchObject({ kind: "focusCell", row, col });
      }
    }
  });

  it("leave the text of a cell to the browser while the caret is inside it", () => {
    for (const key of ["ArrowRight", "ArrowLeft", "Backspace", "Delete"] as BridgeKey[]) {
      for (const state of STATES.filter((each) => each.caret === "middle")) expect(bridgeKey(input(state), key)).toEqual({ kind: "native" });
    }
  });

  it("move between the lines of a wrapped cell before they leave it", () => {
    for (const state of STATES.filter((each) => each.lines === "inner line")) {
      expect(bridgeKey(input(state), "ArrowUp")).toEqual({ kind: "native" });
      expect(bridgeKey(input(state), "ArrowDown")).toEqual({ kind: "native" });
    }
  });
});
