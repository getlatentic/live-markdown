// @vitest-environment jsdom
import { syntaxTree } from "@codemirror/language";
import { type EditorState } from "@codemirror/state";
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "./editorTestHarness";
import { parseTableNode, type TableData, type TableModel } from "./tableModel";

/** Every table model produced across the document, in order. */
function parseAllTables(doc: string): TableModel[] {
  const view = makeEditor(doc, 0);
  const state: EditorState = view.state;
  const models: TableModel[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === "Table") models.push(...parseTableNode(state, node.node));
    },
  });
  return models;
}

/** The first table's data (the common single-table case). */
function parseFirstTable(doc: string): TableData | null {
  return parseAllTables(doc)[0]?.data ?? null;
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

  it("passes a cell's literal <br> markup through to the renderer", () => {
    expect(parseFirstTable("| # | Topic |\n|---|-------|\n| 1 | a<br>b<br>c |")?.rows).toEqual([
      ["1", "a<br>b<br>c"],
    ]);
  });

  it("inline-renders cell markdown (bold, code, link) into HTML", () => {
    const data = parseFirstTable("| **H** | x |\n| --- | --- |\n| `c` | [t](u) |");
    expect(data?.header).toEqual(['<span class="cm-strong">H</span>', "x"]);
    expect(data?.rows).toEqual([
      ['<span class="cm-inline-code">c</span>', '<a href="u" class="cm-link">t</a>'],
    ]);
  });

  it("splits back-to-back tables (no blank line between) into separate models", () => {
    const models = parseAllTables(
      "| A | B |\n| --- | --- |\n| 1 | 2 |\n| C | D |\n| --- | --- |\n| 3 | 4 |",
    );
    expect(models).toHaveLength(2);
    expect(models[0].data).toEqual({
      header: ["A", "B"],
      rows: [["1", "2"]],
      alignments: [null, null],
    });
    expect(models[1].data).toEqual({
      header: ["C", "D"],
      rows: [["3", "4"]],
      alignments: [null, null],
    });
  });

  it("gives each back-to-back table its own non-overlapping source range", () => {
    const doc = "| A |\n| --- |\n| 1 |\n| B |\n| --- |\n| 2 |";
    const models = parseAllTables(doc);
    expect(models).toHaveLength(2);
    expect(models[0].from).toBe(0);
    expect(models[0].to).toBeLessThanOrEqual(models[1].from);
    expect(models[1].to).toBeLessThanOrEqual(doc.length);
  });

  it("keeps independent alignments for back-to-back tables", () => {
    const models = parseAllTables(
      "| A |\n| :-: |\n| 1 |\n| B |\n| --: |\n| 2 |",
    );
    expect(models[0].data.alignments).toEqual(["center"]);
    expect(models[1].data.alignments).toEqual(["right"]);
  });
});
