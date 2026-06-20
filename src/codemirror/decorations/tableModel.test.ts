// @vitest-environment jsdom
import { syntaxTree } from "@codemirror/language";
import { type EditorState } from "@codemirror/state";
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "./editorTestHarness";
import { parseTableNode, type TableData } from "./tableModel";

function parseFirstTable(doc: string): TableData | null {
  const view = makeEditor(doc, 0);
  const state: EditorState = view.state;
  let result: TableData | null = null;
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === "Table" && result === null) {
        result = parseTableNode(state, node.node);
      }
    },
  });
  return result;
}

describe("parseTableNode", () => {
  afterEach(destroyEditors);

  it("parses header, rows, and default (null) alignments", () => {
    expect(parseFirstTable("| A | B |\n| --- | --- |\n| 1 | 2 |")).toEqual({
      header: ["A", "B"],
      rows: [["1", "2"]],
      alignments: [null, null],
    });
  });

  it("reads :--, :-:, --: as left / center / right", () => {
    expect(parseFirstTable("| A | B | C |\n| :-- | :-: | --: |\n| 1 | 2 | 3 |")?.alignments).toEqual([
      "left",
      "center",
      "right",
    ]);
  });

  it("keeps an escaped pipe inside one cell instead of splitting the column", () => {
    expect(parseFirstTable("| A | B |\n| --- | --- |\n| x \\| y | z |")?.rows).toEqual([
      ["x \\| y", "z"],
    ]);
  });

  it("drops a trailing prose line Lezer folds into the table (no blank-line gap)", () => {
    // The table is immediately followed by a sentence with no blank line;
    // Lezer absorbs that line as a delimiter-less TableRow. It must not
    // render as a junk one-cell row.
    const data = parseFirstTable(
      "| A | B |\n| --- | --- |\n| 1 | 2 |\nThis sentence follows with no blank line.",
    );
    expect(data?.rows).toEqual([["1", "2"]]);
  });

  it("renders a cell carrying <br> markup (kept verbatim in the model)", () => {
    expect(parseFirstTable("| # | Topic |\n|---|-------|\n| 1 | a<br>b<br>c |")?.rows).toEqual([
      ["1", "a<br>b<br>c"],
    ]);
  });
});
