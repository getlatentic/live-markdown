// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { EditorView } from "@codemirror/view";

import { destroyEditors, makeEditor } from "./editorTestHarness";
import { showTableMenu, targetCells } from "./tableContextMenu";
import { commentOnExcerptFacet } from "./hostFacets";

function menuLabels(): string[] {
  const menu = document.querySelector(".cm-table-menu");
  return menu ? [...menu.querySelectorAll("button")].map((b) => b.textContent ?? "") : [];
}

describe("showTableMenu", () => {
  afterEach(() => {
    document.querySelectorAll(".cm-table-menu").forEach((m) => m.remove());
    destroyEditors();
  });

  it("lists the row and column actions", () => {
    const view = makeEditor("| A | B |\n| --- | --- |\n| 1 | 2 |", 0);
    showTableMenu({ x: 0, y: 0, view, pos: 2 });
    expect(menuLabels()).toEqual([
      "Insert row above",
      "Insert row below",
      "Delete row",
      "Insert column left",
      "Insert column right",
      "Delete column",
    ]);
  });

  it("adds Comment items at the top when a host wires the comment facet", () => {
    const view = makeEditor("| A | B |\n| --- | --- |\n| 1 | 2 |", 0, [
      commentOnExcerptFacet.of(() => {}),
    ]);
    showTableMenu({ x: 0, y: 0, view, pos: 2 });
    expect(menuLabels()).toEqual([
      "Comment on this row",
      "Comment on this column",
      "Insert row above",
      "Insert row below",
      "Delete row",
      "Insert column left",
      "Insert column right",
      "Delete column",
    ]);
  });

  it("a Comment item hands the row's excerpt to the facet", () => {
    const doc = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    let got: { text: string } | null = null;
    const view = makeEditor(doc, 0, [commentOnExcerptFacet.of((excerpt) => (got = excerpt))]);
    showTableMenu({ x: 0, y: 0, view, pos: doc.lastIndexOf("1") });
    [...document.querySelectorAll<HTMLButtonElement>(".cm-table-menu button")]
      .find((b) => b.textContent === "Comment on this row")!
      .click();
    expect(got!.text).toContain("| 1 | 2 |");
  });

  it("an item runs its command against the cell position", () => {
    const doc = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const view = makeEditor(doc, 0);
    showTableMenu({ x: 0, y: 0, view, pos: doc.lastIndexOf("1") });
    const menu = document.querySelector(".cm-table-menu")!;
    [...menu.querySelectorAll("button")]
      .find((b) => b.textContent === "Insert row below")!
      .click();
    expect(view.state.doc.toString()).toBe("| A | B |\n| --- | --- |\n| 1 | 2 |\n|  |  |");
  });

  it("closes when an item is chosen", () => {
    const view = makeEditor("| A |\n| --- |\n| 1 |", 0);
    showTableMenu({ x: 0, y: 0, view, pos: 2 });
    document.querySelector<HTMLButtonElement>(".cm-table-menu__item")!.click();
    expect(document.querySelector(".cm-table-menu")).toBeNull();
  });
});

describe("targetCells (hover highlight)", () => {
  // A rendered table widget stamps `data-cell-from` on every cell; targetCells
  // resolves a cell position back to the DOM cells of its row or column. Built
  // by hand here — block widgets don't lay out in jsdom — since targetCells only
  // reads `view.dom`.
  const TABLE = `<table class="cm-table-widget">
    <thead><tr><th data-cell-from="0">A</th><th data-cell-from="4">B</th></tr></thead>
    <tbody>
      <tr><td data-cell-from="20">1</td><td data-cell-from="24">2</td></tr>
      <tr><td data-cell-from="30">3</td><td data-cell-from="34">4</td></tr>
    </tbody></table>`;
  function viewWith(html: string): EditorView {
    const dom = document.createElement("div");
    dom.innerHTML = html;
    return { dom } as unknown as EditorView;
  }

  it("returns the clicked cell's whole row", () => {
    expect(targetCells(viewWith(TABLE), 30, "row").map((c) => c.textContent)).toEqual(["3", "4"]);
  });

  it("returns the clicked cell's whole column, header included", () => {
    expect(targetCells(viewWith(TABLE), 24, "column").map((c) => c.textContent)).toEqual([
      "B",
      "2",
      "4",
    ]);
  });

  it("returns nothing when the position is not a table cell", () => {
    expect(targetCells(viewWith(TABLE), 999, "row")).toEqual([]);
  });
});
