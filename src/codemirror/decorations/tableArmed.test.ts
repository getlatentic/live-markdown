// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { armedTable, armedTableField, setArmedTable } from "./tableArmed";
import { destroyEditors, makeEditor } from "./editorTestHarness";
import { tableField } from "./tableField";

describe("armedTable — explicit two-step-delete arming", () => {
  afterEach(destroyEditors);

  const DOC = "para\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\ntail";
  const tableFrom = DOC.indexOf("| A");
  const tableTo = DOC.indexOf("| 1 | 2 |") + "| 1 | 2 |".length;

  it("is null until something explicitly arms it", () => {
    // Caret resting at the table edge (e.g. arrowed there) must NOT arm.
    const view = makeEditor(DOC, tableTo, [tableField, armedTableField]);
    expect(armedTable(view.state)).toBeNull();
  });

  it("reflects an arming effect (the delete normalizer's first press)", () => {
    const view = makeEditor(DOC, tableTo, [tableField, armedTableField]);
    view.dispatch({
      selection: { anchor: tableTo },
      effects: setArmedTable.of({ from: tableFrom, edge: "end" }),
    });
    expect(armedTable(view.state)).toEqual({ from: tableFrom, edge: "end" });
  });

  it("disarms on any later cursor move", () => {
    const view = makeEditor(DOC, tableTo, [tableField, armedTableField]);
    view.dispatch({ effects: setArmedTable.of({ from: tableFrom, edge: "end" }) });
    view.dispatch({ selection: { anchor: DOC.indexOf("tail") } });
    expect(armedTable(view.state)).toBeNull();
  });

  it("disarms on any document edit", () => {
    const view = makeEditor(DOC, tableTo, [tableField, armedTableField]);
    view.dispatch({ effects: setArmedTable.of({ from: tableFrom, edge: "end" }) });
    view.dispatch({ changes: { from: DOC.length, insert: "!" } });
    expect(armedTable(view.state)).toBeNull();
  });
});
