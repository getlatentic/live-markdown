// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "./editorTestHarness";
import { columnExcerptAt, rowExcerptAt, type TableExcerpt } from "./tableExcerpt";

const TABLE = "| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |";

function at(
  doc: string,
  needle: string,
  pick: (state: ReturnType<typeof makeEditor>["state"], pos: number) => TableExcerpt | null,
): TableExcerpt | null {
  const pos = doc.indexOf(needle);
  return pick(makeEditor(doc, pos).state, pos);
}

describe("tableExcerpt", () => {
  afterEach(destroyEditors);

  it("rowExcerptAt returns the header, delimiter, and the clicked body row", () => {
    expect(at(TABLE, "5", rowExcerptAt)?.text).toBe(
      "| A | B | C |\n| --- | --- | --- |\n| 4 | 5 | 6 |",
    );
  });

  it("rowExcerptAt on the header row returns just the header", () => {
    expect(at(TABLE, "B", rowExcerptAt)?.text).toBe("| A | B | C |");
  });

  it("rowExcerptAt range spans the clicked row's line", () => {
    const pos = TABLE.indexOf("5");
    const state = makeEditor(TABLE, pos).state;
    const line = state.doc.lineAt(pos);
    expect(rowExcerptAt(state, pos)?.range).toEqual({ start: line.from, end: line.to });
  });

  it("columnExcerptAt returns the column header + every body cell as a one-column table", () => {
    expect(at(TABLE, "5", columnExcerptAt)?.text).toBe("| B |\n| --- |\n| 2 |\n| 5 |");
  });

  it("columnExcerptAt range spans the whole table (a column's source is non-contiguous)", () => {
    const pos = TABLE.indexOf("5");
    const excerpt = columnExcerptAt(makeEditor(TABLE, pos).state, pos);
    expect(excerpt?.range).toEqual({ start: 0, end: TABLE.length });
  });

  it("both return null outside a table", () => {
    const state = makeEditor("just a paragraph", 3).state;
    expect(rowExcerptAt(state, 3)).toBeNull();
    expect(columnExcerptAt(state, 3)).toBeNull();
  });
});
