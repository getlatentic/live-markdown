// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "./editorTestHarness";
import { TableWidget } from "./tableWidget";

/** A cell with an optional source range — most render tests don't care about offsets. */
const c = (html: string, from = 0, to = 0) => ({ html, from, to });

describe("TableWidget", () => {
  afterEach(destroyEditors);

  it("renders header + body cells with per-column alignment", () => {
    const view = makeEditor("placeholder", 0);
    const widget = new TableWidget(
      { header: [c("A"), c("B")], rows: [[c("1"), c("2")]], alignments: ["left", "right"] },
      0,
      5,
    );
    const dom = widget.toDOM(view);
    expect(dom.tagName).toBe("TABLE");
    expect([...dom.querySelectorAll("th")].map((th) => th.textContent)).toEqual(["A", "B"]);
    expect([...dom.querySelectorAll("td")].map((td) => td.textContent)).toEqual(["1", "2"]);
    const ths = dom.querySelectorAll("th");
    expect((ths[0] as HTMLElement).style.textAlign).toBe("left");
    expect((ths[1] as HTMLElement).style.textAlign).toBe("right");
  });

  it("renders a cell's <br> as a real line break, not the literal tag", () => {
    const view = makeEditor("placeholder", 0);
    const widget = new TableWidget(
      { header: [c("Topic")], rows: [[c("one<br>two<br>three")]], alignments: [null] },
      0,
      5,
    );
    const dom = widget.toDOM(view);
    const td = dom.querySelector("td")!;
    expect(td.querySelectorAll("br")).toHaveLength(2);
    expect(td.textContent).toBe("onetwothree");
    expect(td.innerHTML).not.toContain("&lt;br&gt;");
  });

  it("strips dangerous markup from cell content (DOMPurify)", () => {
    const view = makeEditor("placeholder", 0);
    const widget = new TableWidget(
      { header: [c("x")], rows: [[c('<img src=x onerror="alert(1)"><script>alert(1)</script>safe')]], alignments: [null] },
      0,
      5,
    );
    const td = widget.toDOM(view).querySelector("td")!;
    expect(td.querySelector("script")).toBeNull();
    expect(td.querySelector("img")).toBeNull();
    expect(td.textContent).toBe("safe");
  });

  it("double-click on a cell mounts an inline editor seeded with the cell source", () => {
    const doc = "| hi | y |\n| --- | --- |\n| 1 | 2 |";
    const view = makeEditor(doc, 0);
    const hiAt = doc.indexOf("hi");
    const yAt = doc.indexOf("y");
    const widget = new TableWidget(
      { header: [c("hi", hiAt, hiAt + 2), c("y", yAt, yAt + 1)], rows: [], alignments: [null, null] },
      0,
      doc.length,
    );
    const th = widget.toDOM(view).querySelector("th")!;
    th.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

    const content = th.querySelector(".cm-content");
    expect(content).not.toBeNull();
    expect(content?.textContent).toBe("hi");
    content?.dispatchEvent(new FocusEvent("blur")); // commit + tear down
  });

  it("stamps each cell's source range on the element (data-cell-from/to)", () => {
    const view = makeEditor("placeholder", 0);
    const widget = new TableWidget(
      { header: [c("A", 0, 1)], rows: [[c("1", 10, 11)]], alignments: [null] },
      0,
      20,
    );
    const dom = widget.toDOM(view);
    const th = dom.querySelector("th")!;
    const td = dom.querySelector("td")!;
    expect([th.dataset.cellFrom, th.dataset.cellTo]).toEqual(["0", "1"]);
    expect([td.dataset.cellFrom, td.dataset.cellTo]).toEqual(["10", "11"]);
  });
});
