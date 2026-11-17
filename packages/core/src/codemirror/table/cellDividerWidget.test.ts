// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { CellDividerWidget } from "./cellDividerWidget";
import { destroyEditors, makeEditor } from "../core/editorTestHarness";

describe("CellDividerWidget", () => {
  afterEach(destroyEditors);

  it("renders an empty span.cm-table-divider", () => {
    const dom = new CellDividerWidget().toDOM(makeEditor("x", 0));
    expect(dom.tagName).toBe("SPAN");
    expect(dom.className).toBe("cm-table-divider");
  });

  it("eq() is always true and ignoreEvent() is false", () => {
    expect(new CellDividerWidget().eq(new CellDividerWidget())).toBe(true);
    expect(new CellDividerWidget().ignoreEvent()).toBe(false);
  });
});
