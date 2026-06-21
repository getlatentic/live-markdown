// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { armedTableFrom } from "./tableArmed";
import { destroyEditors, makeEditor } from "./editorTestHarness";
import { tableField } from "./tableField";

describe("armedTableFrom — the table a parked caret will delete", () => {
  afterEach(destroyEditors);

  const DOC = "para\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\ntail";
  const tableFrom = DOC.indexOf("| A");
  const tableTo = DOC.indexOf("| 1 | 2 |") + "| 1 | 2 |".length;

  it("arms the table when the caret sits at its end edge (Backspace park)", () => {
    const view = makeEditor(DOC, tableTo, [tableField]);
    expect(armedTableFrom(view.state)).toBe(tableFrom);
  });

  it("arms the table when the caret sits at its start edge (Delete park)", () => {
    const view = makeEditor(DOC, tableFrom, [tableField]);
    expect(armedTableFrom(view.state)).toBe(tableFrom);
  });

  it("does not arm when the caret is on the paragraph below the table", () => {
    const view = makeEditor(DOC, DOC.indexOf("tail"), [tableField]);
    expect(armedTableFrom(view.state)).toBe(-1);
  });

  it("does not arm for a non-empty selection touching the edge", () => {
    const view = makeEditor(DOC, tableTo, [tableField]);
    view.dispatch({ selection: { anchor: tableTo, head: DOC.indexOf("tail") } });
    expect(armedTableFrom(view.state)).toBe(-1);
  });
});
