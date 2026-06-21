// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "./editorTestHarness";
import { mountCellSubview } from "./tableCellSubview";

describe("mountCellSubview", () => {
  afterEach(destroyEditors);

  it("seeds the editor with the cell's raw markdown source", () => {
    const doc = "| A | B |\n| --- | --- |\n| **x** | y |";
    const view = makeEditor(doc, 0);
    const from = doc.indexOf("**x**");
    const sub = mountCellSubview(document.createElement("td"), view, from, from + "**x**".length);
    expect(sub.view.state.doc.toString()).toBe("**x**");
    sub.commit();
  });

  it("commits an edited cell back to the document as a single change", () => {
    const doc = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const view = makeEditor(doc, 0);
    const from = doc.lastIndexOf("1");
    const sub = mountCellSubview(document.createElement("td"), view, from, from + 1);
    sub.view.dispatch({ changes: { from: 0, to: 1, insert: "100" } });
    sub.commit();
    expect(view.state.doc.toString()).toBe("| A | B |\n| --- | --- |\n| 100 | 2 |");
  });

  it("restores the rendered cell and leaves the doc alone when unchanged", () => {
    const doc = "| A |\n| --- |\n| z |";
    const view = makeEditor(doc, 0);
    const from = doc.lastIndexOf("z");
    const cell = document.createElement("td");
    cell.innerHTML = "<span>z</span>";
    const sub = mountCellSubview(cell, view, from, from + 1);
    expect(cell.querySelector(".cm-editor")).not.toBeNull();
    sub.commit();
    expect(view.state.doc.toString()).toBe(doc);
    expect(cell.innerHTML).toBe("<span>z</span>");
  });

  it("rejects a newline so a cell can never break its row", () => {
    const doc = "| A |\n| --- |\n| z |";
    const view = makeEditor(doc, 0);
    const from = doc.lastIndexOf("z");
    const sub = mountCellSubview(document.createElement("td"), view, from, from + 1);
    sub.view.dispatch({ changes: { from: 0, to: 1, insert: "a\nb" } });
    expect(sub.view.state.doc.toString()).toBe("z");
    sub.commit();
  });
});
