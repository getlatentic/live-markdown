// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "./editorTestHarness";
import { showTableMenu } from "./tableContextMenu";

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
