// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "./editorTestHarness";
import { tableField } from "./tableField";
import { nextVisiblePosition, previousVisiblePosition } from "./visiblePosition";

describe("visiblePosition — steps over a table's hidden block source", () => {
  afterEach(destroyEditors);

  // A table between two paragraphs. The grid's `| … |` source is hidden behind
  // the block widget, so the caret must never stop inside [tableFrom, tableTo).
  const DOC = "para\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\ntail";
  const tableFrom = DOC.indexOf("| A");
  const tableTo = DOC.indexOf("| 1 | 2 |") + "| 1 | 2 |".length;

  it("steps forward from the table's start edge to just past its end", () => {
    const view = makeEditor(DOC, 0, [tableField]);
    expect(nextVisiblePosition(view, tableFrom)).toBe(tableTo + 1);
  });

  it("steps back from the table's end edge to just before its start", () => {
    const view = makeEditor(DOC, 0, [tableField]);
    expect(previousVisiblePosition(view, tableTo)).toBe(tableFrom - 1);
  });

  it("escapes forward when starting from inside the hidden source", () => {
    const view = makeEditor(DOC, 0, [tableField]);
    expect(nextVisiblePosition(view, tableFrom + 3)).toBe(tableTo + 1);
  });
});
