// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "./editorTestHarness";
import { tableField } from "./tableField";
import { TableWidgetV2 } from "../tablev2/tableWidgetV2";

describe("tableField", () => {
  afterEach(destroyEditors);

  it("replaces a GFM table node with a block TableWidgetV2", () => {
    const doc = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const view = makeEditor(doc, 0, [tableField]);
    const set = view.state.field(tableField);
    const ranges: Array<{ from: number; isTable: boolean }> = [];
    set.between(0, view.state.doc.length, (from, _to, deco) => {
      ranges.push({ from, isTable: deco.spec.widget instanceof TableWidgetV2 });
    });
    expect(ranges).toHaveLength(1);
    expect(ranges[0].from).toBe(0);
    expect(ranges[0].isTable).toBe(true);
  });

  it("emits no decoration when there is no table", () => {
    const view = makeEditor("just a paragraph", 0, [tableField]);
    let count = 0;
    view.state.field(tableField).between(0, view.state.doc.length, () => {
      count += 1;
    });
    expect(count).toBe(0);
  });
});
