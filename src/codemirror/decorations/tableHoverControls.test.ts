// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "./editorTestHarness";
import { TableWidget } from "./tableWidget";

const c = (html: string, from = 0, to = 0) => ({ html, from, to });

const DOC = "| A | B |\n| --- | --- |\n| 1 | 2 |";

describe("table hover inserters", () => {
  afterEach(destroyEditors);

  it("reveals on cell hover and inserts a row below on the row inserter click", () => {
    const view = makeEditor(DOC, 0);
    const oneAt = DOC.lastIndexOf("1");
    const twoAt = DOC.lastIndexOf("2");
    const widget = new TableWidget(
      {
        header: [c("A", 2, 3), c("B", 6, 7)],
        rows: [[c("1", oneAt, oneAt + 1), c("2", twoAt, twoAt + 1)]],
        alignments: [null, null],
      },
      0,
      DOC.length,
    );
    const wrap = widget.toDOM(view);
    const rowPlus = wrap.querySelector<HTMLElement>(".cm-table-inserter--row")!;
    expect(rowPlus.style.display).toBe("none");

    wrap.querySelector("td")!.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(rowPlus.style.display).toBe("flex");

    rowPlus.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(view.state.doc.toString()).toBe(`${DOC}\n|  |  |`);
  });

  it("inserts a column after the hovered column on the column inserter click", () => {
    const view = makeEditor(DOC, 0);
    const widget = new TableWidget(
      { header: [c("A", 2, 3), c("B", 6, 7)], rows: [], alignments: [null, null] },
      0,
      DOC.length,
    );
    const wrap = widget.toDOM(view);
    const colPlus = wrap.querySelector<HTMLElement>(".cm-table-inserter--column")!;

    wrap.querySelector("th")!.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    colPlus.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const headerPipes = view.state.doc.toString().split("\n")[0].match(/\|/g) ?? [];
    expect(headerPipes).toHaveLength(4); // a third column → one more pipe
  });

  it("stays hidden while a cell editor is open", () => {
    const view = makeEditor(DOC, 0);
    const widget = new TableWidget(
      { header: [c("A", 2, 3), c("B", 6, 7)], rows: [], alignments: [null, null] },
      0,
      DOC.length,
    );
    const wrap = widget.toDOM(view);
    const rowPlus = wrap.querySelector<HTMLElement>(".cm-table-inserter--row")!;
    const th = wrap.querySelector("th")!;
    th.dispatchEvent(new MouseEvent("click", { bubbles: true })); // mounts the cell editor

    th.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(rowPlus.style.display).toBe("none");

    th.querySelector(".cm-content")?.dispatchEvent(new FocusEvent("blur"));
  });
});
