// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "../core/editorTestHarness";
import { modelAt } from "./tableGeometry";

const DOC = "para\n\n| A | B |\n| --- | --- |\n| 1 | 2 |";
const TABLE_FROM = DOC.indexOf("| A");

describe("modelAt", () => {
  afterEach(destroyEditors);

  it("resolves the table from its own start boundary (keyboard entry + cell nav rely on this)", () => {
    // `resolveInner(pos, +1)` — a `0` side returns the gap before the table here.
    expect(modelAt(makeEditor(DOC, 0).state, TABLE_FROM)?.from).toBe(TABLE_FROM);
  });

  it("resolves the table from a position inside a cell", () => {
    expect(modelAt(makeEditor(DOC, 0).state, DOC.indexOf("1"))?.from).toBe(TABLE_FROM);
  });

  it("is null outside any table", () => {
    expect(modelAt(makeEditor(DOC, 0).state, 1)).toBeNull();
  });
});
