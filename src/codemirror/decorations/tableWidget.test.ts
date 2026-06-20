// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "./editorTestHarness";
import { TableWidget } from "./tableWidget";

describe("TableWidget", () => {
  afterEach(destroyEditors);

  it("renders header + body cells with per-column alignment", () => {
    const view = makeEditor("placeholder", 0);
    const widget = new TableWidget(
      { header: ["A", "B"], rows: [["1", "2"]], alignments: ["left", "right"] },
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
      { header: ["Topic"], rows: [["one<br>two<br>three"]], alignments: [null] },
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
      { header: ["x"], rows: [['<img src=x onerror="alert(1)"><script>alert(1)</script>safe']], alignments: [null] },
      0,
      5,
    );
    const td = widget.toDOM(view).querySelector("td")!;
    expect(td.querySelector("script")).toBeNull();
    expect(td.querySelector("img")).toBeNull();
    expect(td.textContent).toBe("safe");
  });

  it("double-click selects the table's source range (to drop into editing)", () => {
    const view = makeEditor("placeholder", 0);
    const widget = new TableWidget({ header: ["A"], rows: [], alignments: [null] }, 0, 5);
    const dom = widget.toDOM(view);
    dom.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect([view.state.selection.main.from, view.state.selection.main.to]).toEqual([0, 5]);
  });
});
