// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { armedTable } from "./tableArmed";
import { destroyEditors, makeEditor } from "./editorTestHarness";
import { tableField } from "./tableField";

describe("armedTable — the table (and edge) a parked caret will delete", () => {
  afterEach(destroyEditors);

  const DOC = "para\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\ntail";
  const tableFrom = DOC.indexOf("| A");
  const tableTo = DOC.indexOf("| 1 | 2 |") + "| 1 | 2 |".length;

  it("arms the table's end edge when the caret sits there (Backspace park)", () => {
    const view = makeEditor(DOC, tableTo, [tableField]);
    expect(armedTable(view.state)).toEqual({ from: tableFrom, edge: "end" });
  });

  it("arms the table's start edge when the caret sits there (Delete park)", () => {
    const view = makeEditor(DOC, tableFrom, [tableField]);
    expect(armedTable(view.state)).toEqual({ from: tableFrom, edge: "start" });
  });

  it("does not arm when the caret is on the paragraph below the table", () => {
    const view = makeEditor(DOC, DOC.indexOf("tail"), [tableField]);
    expect(armedTable(view.state)).toBeNull();
  });

  it("does not arm for a non-empty selection touching the edge", () => {
    const view = makeEditor(DOC, tableTo, [tableField]);
    view.dispatch({ selection: { anchor: tableTo, head: DOC.indexOf("tail") } });
    expect(armedTable(view.state)).toBeNull();
  });
});
