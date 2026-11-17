// @vitest-environment jsdom
import { type ChangeSpec, type EditorState } from "@codemirror/state";
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "../core/editorTestHarness";
import {
  addColumnAfter,
  addColumnBefore,
  addRowAbove,
  addRowBelow,
  deleteColumn,
  deleteRow,
} from "./tableEditCommands";

/** Place the cursor at the first occurrence of `at`, run `cmd`, return the doc. */
function run(
  doc: string,
  at: string,
  cmd: (state: EditorState, pos: number) => ChangeSpec | null,
): string {
  const pos = doc.indexOf(at);
  const view = makeEditor(doc, pos);
  const change = cmd(view.state, pos);
  if (change) view.dispatch({ changes: change });
  return view.state.doc.toString();
}

describe("table structural commands", () => {
  afterEach(destroyEditors);

  it("addRowBelow appends an empty row after the current body row", () => {
    expect(run("| A | B |\n| --- | --- |\n| 1 | 2 |", "1", addRowBelow)).toBe(
      "| A | B |\n| --- | --- |\n| 1 | 2 |\n|  |  |",
    );
  });

  it("addRowBelow from the header inserts the first body row after the delimiter", () => {
    expect(run("| A | B |\n| --- | --- |\n| 1 | 2 |", "A", addRowBelow)).toBe(
      "| A | B |\n| --- | --- |\n|  |  |\n| 1 | 2 |",
    );
  });

  it("addRowAbove inserts an empty row above the current body row", () => {
    expect(run("| A | B |\n| --- | --- |\n| 1 | 2 |", "1", addRowAbove)).toBe(
      "| A | B |\n| --- | --- |\n|  |  |\n| 1 | 2 |",
    );
  });

  it("deleteRow removes the body row at the cursor", () => {
    expect(run("| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |", "1", deleteRow)).toBe(
      "| A | B |\n| --- | --- |\n| 3 | 4 |",
    );
  });

  it("deleteRow is a no-op on the header row", () => {
    const doc = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    expect(run(doc, "A", deleteRow)).toBe(doc);
  });

  it("returns null when the cursor isn't in a table", () => {
    const view = makeEditor("just a paragraph", 2);
    expect(addRowBelow(view.state, 2)).toBeNull();
    expect(deleteRow(view.state, 2)).toBeNull();
  });

  it("edits the right back-to-back table (each is its own model)", () => {
    const doc = "| A |\n| --- |\n| 1 |\n| B |\n| --- |\n| 2 |";
    // Cursor in the SECOND table's body row ("2"); addRowBelow must extend it.
    expect(run(doc, "2", addRowBelow)).toBe(
      "| A |\n| --- |\n| 1 |\n| B |\n| --- |\n| 2 |\n|  |",
    );
  });

  it("addColumnAfter adds a column to the right of the cursor, in every row", () => {
    expect(run("| A | B |\n| --- | --- |\n| 1 | 2 |", "A", addColumnAfter)).toBe(
      "| A |  | B |\n| --- | --- | --- |\n| 1 |  | 2 |",
    );
  });

  it("addColumnBefore adds a column to the left of the cursor", () => {
    expect(run("| A | B |\n| --- | --- |\n| 1 | 2 |", "B", addColumnBefore)).toBe(
      "| A |  | B |\n| --- | --- | --- |\n| 1 |  | 2 |",
    );
  });

  it("deleteColumn removes the cursor's column from every row", () => {
    expect(
      run("| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |", "B", deleteColumn),
    ).toBe("| A | C |\n| --- | --- |\n| 1 | 3 |");
  });

  it("deleteColumn is a no-op on a single-column table", () => {
    const doc = "| A |\n| --- |\n| 1 |";
    expect(run(doc, "A", deleteColumn)).toBe(doc);
  });
});
