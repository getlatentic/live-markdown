// @vitest-environment jsdom
// Redesign step 1 (pure model, node/jsdom — no layout needed): prove the
// Lezer-based reader handles the GFM cases the review flagged as "non-trivial".
// If these pass, the parsing foundation is sound and the redesign work is the
// widget + bridge, not the model.
import { syntaxTree } from "@codemirror/language";
import { type EditorState } from "@codemirror/state";
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "../core/editorTestHarness";
import { parseTableNode, type TableModel } from "./tableModel";

function parse(doc: string): TableModel[] {
  const view = makeEditor(doc, 0);
  const state: EditorState = view.state;
  const models: TableModel[] = [];
  syntaxTree(state).iterate({
    enter(n) {
      if (n.name === "Table") models.push(...parseTableNode(state, n.node));
    },
  });
  return models;
}
const slice = (doc: string, c: { from: number; to: number }) => doc.slice(c.from, c.to);

describe("GFM model — the review's hard cases", () => {
  afterEach(destroyEditors);

  it("escaped pipe stays inside one cell (not split)", () => {
    const doc = "| a \\| b | c |\n| --- | --- |\n| d | e |";
    const [m] = parse(doc);
    expect(m.data.header).toHaveLength(2);
    expect(slice(doc, m.data.header[0])).toContain("\\|");
  });

  it("alignment row: left / right / center / none", () => {
    const doc = "| a | b | c | d |\n| :--- | ---: | :-: | --- |\n| 1 | 2 | 3 | 4 |";
    expect(parse(doc)[0].data.alignments).toEqual(["left", "right", "center", null]);
  });

  it("empty cells are reconstructed and stay addressable", () => {
    const doc = "| a | b |\n| --- | --- |\n|  | y |";
    const [m] = parse(doc);
    expect(m.data.rows[0]).toHaveLength(2);
    expect(m.data.rows[0][0].html).toBe("");
  });

  it("uneven row (fewer cells than header) doesn't crash", () => {
    const doc = "| a | b | c |\n| --- | --- | --- |\n| x |";
    const [m] = parse(doc);
    expect(m.data.header).toHaveLength(3);
    expect(m.data.rows[0].length).toBeGreaterThanOrEqual(1);
  });

  it("no outer pipes (bare GFM) still parses", () => {
    const doc = "a | b\n--- | ---\n1 | 2";
    const [m] = parse(doc);
    expect(m.data.header).toHaveLength(2);
    expect(m.data.rows[0]).toHaveLength(2);
  });

  it("inline code containing a pipe stays one cell", () => {
    const doc = "| `a\\|b` | c |\n| --- | --- |\n| d | e |";
    const [m] = parse(doc);
    expect(m.data.header).toHaveLength(2);
  });

  it("cell source ranges slice back to the right text", () => {
    const doc = "| alpha | beta |\n| --- | --- |\n| gg | hh |";
    const [m] = parse(doc);
    expect(slice(doc, m.data.header[0]).trim()).toBe("alpha");
    expect(slice(doc, m.data.rows[0][1]).trim()).toBe("hh");
  });

  it("back-to-back tables (no blank line) split into two models", () => {
    const doc = "| a |\n| --- |\n| 1 |\n| b |\n| --- |\n| 2 |";
    expect(parse(doc).length).toBe(2);
  });
});
