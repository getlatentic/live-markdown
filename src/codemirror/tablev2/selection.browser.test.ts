/**
 * @browser tier for cell selection, copy, the structure menu, undo routing,
 * and empty-cell editing (feature scenarios 6, 11–12, 14–15 + cross-cutting
 * undo) — inline surface, real WebKit.
 */

import { history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { userEvent } from "@vitest/browser/context";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type CellRef, cellElement, cellRange } from "./cellEditingSurface";
import { InlineCellSurface } from "./inlineCellSurface";
import { SELECTED_CLASS } from "./tableV2Selection";
import { tableV2 } from "./tableWidgetV2";
import { tableV2Interaction } from "./tableV2Interaction";

const DOC = `intro prose

| Name | Role |
| --- | --- |
| Ada | Engineer |
| Lin | Designer |

outro prose`;

let view: EditorView | null = null;
let surface: InlineCellSurface | null = null;

async function setup() {
  surface = new InlineCellSurface();
  const state = EditorState.create({
    doc: DOC,
    extensions: [
      history(),
      keymap.of(historyKeymap),
      markdown({ base: markdownLanguage }),
      tableV2(surface),
      tableV2Interaction(surface),
    ],
  });
  ensureSyntaxTree(state, DOC.length, 5000);
  view = new EditorView({ state, parent: document.body });
  await vi.waitFor(() => {
    if (!view!.dom.querySelector("[data-tablev2-from]")) throw new Error("widget not rendered");
  });
  return { view: view!, surface: surface! };
}

afterEach(() => {
  surface?.cancel();
  view?.destroy();
  view = null;
  surface = null;
  document.querySelectorAll(".cm-table-menu").forEach((el) => el.remove());
});

const tf = (v: EditorView) => v.state.doc.toString().indexOf("| Name");
const td = (v: EditorView, ref: CellRef) => {
  const el = cellElement(v, tf(v), ref);
  if (!el) throw new Error(`cell ${ref.row},${ref.col} not rendered`);
  return el;
};

function mouse(type: string, el: Element, opts: MouseEventInit = {}): void {
  const rect = el.getBoundingClientRect();
  el.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      ...opts,
    }),
  );
}

function dragSelect(v: EditorView, from: CellRef, to: CellRef): void {
  mouse("mousedown", td(v, from));
  mouse("mousemove", td(v, to));
  mouse("mouseup", td(v, to));
}

describe("cell selection (drag)", () => {
  it("a drag selects whole cells, no ragged text selection, no edit", async () => {
    const { view: v, surface: s } = await setup();
    dragSelect(v, { row: 1, col: 0 }, { row: 2, col: 1 });

    const selected = v.dom.querySelectorAll(`.${SELECTED_CLASS}`);
    expect(selected).toHaveLength(4);
    expect(s.active()).toBeNull();
    expect(document.getSelection()?.isCollapsed ?? true).toBe(true);
  });

  it("copy serialises the selection as TSV from the current doc", async () => {
    const { view: v } = await setup();
    dragSelect(v, { row: 1, col: 0 }, { row: 2, col: 1 });

    const dt = new DataTransfer();
    const event = new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(dt.getData("text/plain")).toBe("Ada\tEngineer\nLin\tDesigner");
    expect(event.defaultPrevented).toBe(true);
  });

  it("a later click clears the selection and edits normally", async () => {
    const { view: v, surface: s } = await setup();
    dragSelect(v, { row: 1, col: 0 }, { row: 2, col: 1 });

    mouse("mousedown", td(v, { row: 0, col: 0 }));
    mouse("mouseup", td(v, { row: 0, col: 0 }));

    expect(v.dom.querySelectorAll(`.${SELECTED_CLASS}`)).toHaveLength(0);
    expect(s.active()?.ref).toEqual({ row: 0, col: 0 });
  });

  it("a document change clears the selection (transient by design)", async () => {
    const { view: v } = await setup();
    dragSelect(v, { row: 1, col: 0 }, { row: 2, col: 1 });
    v.dispatch({ changes: { from: 0, insert: "X" } });
    expect(v.dom.querySelectorAll(`.${SELECTED_CLASS}`)).toHaveLength(0);
  });
});

describe("structure menu (right-click)", () => {
  it("opens on a cell and its 'Insert row below' inserts below that row", async () => {
    const { view: v } = await setup();
    const before = v.state.doc.toString();
    mouse("contextmenu", td(v, { row: 2, col: 0 }));

    const menu = document.querySelector(".cm-table-menu");
    expect(menu).not.toBeNull();
    const item = Array.from(menu!.querySelectorAll("button")).find(
      (b) => b.textContent === "Insert row below",
    );
    expect(item).toBeDefined();
    item!.click();

    const after = v.state.doc.toString();
    expect(after).not.toBe(before);
    expect(after.split("\n").filter((l) => l.trim().startsWith("|"))).toHaveLength(5);
    expect(document.querySelector(".cm-table-menu")).toBeNull();
  });
});

describe("empty cells", () => {
  it("a freshly inserted empty cell edits like any other", async () => {
    const { view: v, surface: s } = await setup();
    mouse("contextmenu", td(v, { row: 2, col: 0 }));
    Array.from(document.querySelectorAll(".cm-table-menu button"))
      .find((b) => b.textContent === "Insert row below")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => {
      if (!cellElement(v, tf(v), { row: 3, col: 0 })) throw new Error("new row not rendered");
    });

    expect(s.begin(v, tf(v), { row: 3, col: 0 }, 0)).toBe(true);
    await userEvent.keyboard("eta");
    s.commit(v);
    const r = cellRange(v.state, tf(v), { row: 3, col: 0 })!;
    expect(v.state.sliceDoc(r.from, r.to)).toBe("eta");
  });
});

describe("undo routing (CM-owned history)", () => {
  it("mid-edit Mod-z reverts the cell to the text the edit began with", async () => {
    const { view: v, surface: s } = await setup();
    s.begin(v, tf(v), { row: 1, col: 0 }, Number.MAX_SAFE_INTEGER);
    await userEvent.keyboard("XY");
    expect(s.active()?.text).toBe("AdaXY");

    await userEvent.keyboard("{Meta>}z{/Meta}");
    expect(s.active()?.text).toBe("Ada");
    expect(s.active()?.caret).toBe(3);
  });

  it("after commit, Mod-z is one CM history step back to the original", async () => {
    const { view: v, surface: s } = await setup();
    s.begin(v, tf(v), { row: 1, col: 0 }, Number.MAX_SAFE_INTEGER);
    await userEvent.keyboard("Q");
    s.commit(v);
    expect(v.state.doc.toString()).toContain("AdaQ");

    v.focus();
    await userEvent.keyboard("{Meta>}z{/Meta}");
    expect(v.state.doc.toString()).not.toContain("AdaQ");
    expect(v.state.doc.toString()).toContain("| Ada |");
  });
});
