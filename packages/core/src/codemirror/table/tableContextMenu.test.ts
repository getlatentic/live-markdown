// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "../core/editorTestHarness";
import { showTableMenu, cellsBeside, targetCells } from "./tableContextMenu";
import { commentOnExcerptFacet } from "../core/hostFacets";

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

describe("the cells beside a cell (hover highlight)", () => {
  // Built by hand: the row and column of a cell are read off the table's
  // elements alone.
  const dom = document.createElement("div");
  dom.innerHTML = `<table class="cm-table-widget">
    <thead><tr><th>A</th><th>B</th></tr></thead>
    <tbody>
      <tr><td>1</td><td>2</td></tr>
      <tr><td>3</td><td>4</td></tr>
    </tbody></table>`;
  const cell = (text: string): HTMLElement => Array.from(dom.querySelectorAll<HTMLElement>("th, td")).find((el) => el.textContent === text)!;

  it("are the cell's whole row", () => {
    expect(cellsBeside(cell("3"), "row").map((c) => c.textContent)).toEqual(["3", "4"]);
  });

  it("are the cell's whole column, header included", () => {
    expect(cellsBeside(cell("2"), "column").map((c) => c.textContent)).toEqual(["B", "2", "4"]);
  });

  it("are none for a position that is not a table cell", () => {
    const view = makeEditor("plain text", 0);
    expect(targetCells(view, 3, "row")).toEqual([]);
  });
});
