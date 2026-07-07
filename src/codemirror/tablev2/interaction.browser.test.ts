/**
 * @browser tier for the interaction layer (feature scenarios 1–5, 14): entry,
 * exit, click-to-edit with caret at the click point, Tab/arrow traversal,
 * Backspace navigation, and main-selection isolation — with the production
 * (inline) surface, in real WebKit.
 *
 * Event realism: main-selection isolation and entry use REAL events
 * (userEvent), so the preventDefault/keymap paths are genuinely exercised.
 * The caret-precision case uses a coordinate-targeted synthetic mousedown —
 * there the unit under test is our offsetAtPoint mapping, not the browser.
 */

import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { userEvent } from "@vitest/browser/context";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type CellRef, cellElement, cellRange } from "./cellEditingSurface";
import { InlineCellSurface } from "./inlineCellSurface";
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
});

const tf = (v: EditorView) => v.state.doc.toString().indexOf("| Name");
const td = (v: EditorView, ref: CellRef) => {
  const el = cellElement(v, tf(v), ref);
  if (!el) throw new Error(`cell ${ref.row},${ref.col} not rendered`);
  return el;
};
const cellText = (v: EditorView, ref: CellRef) => {
  const r = cellRange(v.state, tf(v), ref);
  return r ? v.state.sliceDoc(r.from, r.to) : "<unresolved>";
};

function clickAt(el: Element, clientX: number, clientY: number): void {
  for (const type of ["mousedown", "mouseup"] as const) {
    el.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 }),
    );
  }
}

describe("click-to-edit", () => {
  it("a real click begins the edit and never moves the main selection", async () => {
    const { view: v, surface: s } = await setup();
    v.dispatch({ selection: { anchor: 3 } });
    const before = v.state.selection.main.head;

    await userEvent.click(td(v, { row: 1, col: 0 }));

    expect(s.active()?.ref).toEqual({ row: 1, col: 0 });
    expect(document.activeElement).toBe(s.editingElement());
    expect(v.state.selection.main.head).toBe(before);
  });

  it("the caret lands at the clicked character (between A and d)", async () => {
    const { view: v, surface: s } = await setup();
    const cell = td(v, { row: 1, col: 0 });
    // Measure the boundary after "A" on the RENDERED text, then aim there.
    const textNode = cell.firstChild!;
    // The left half of the "d" glyph resolves to the boundary after "A".
    const probe = document.createRange();
    probe.setStart(textNode, 1);
    probe.setEnd(textNode, 2);
    const rect = probe.getBoundingClientRect();
    clickAt(cell, rect.left + Math.min(2, rect.width / 4), rect.top + rect.height / 2);

    expect(s.active()?.ref).toEqual({ row: 1, col: 0 });
    expect(s.active()?.caret).toBe(1);
    await userEvent.keyboard("x");
    expect(s.active()?.text).toBe("Axda");
  });

  it("clicking another cell commits the current edit first", async () => {
    const { view: v, surface: s } = await setup();
    s.begin(v, tf(v), { row: 1, col: 0 }, 0);
    await userEvent.keyboard("Q");
    await userEvent.click(td(v, { row: 2, col: 1 }));

    expect(cellText(v, { row: 1, col: 0 })).toBe("QAda");
    expect(s.active()?.ref).toEqual({ row: 2, col: 1 });
  });
});

describe("bridge keys", () => {
  it("Tab commits and steps to the next cell; Shift-Tab returns to its end", async () => {
    const { view: v, surface: s } = await setup();
    s.begin(v, tf(v), { row: 1, col: 0 }, 0);
    await userEvent.keyboard("Q");

    await userEvent.keyboard("{Tab}");
    expect(cellText(v, { row: 1, col: 0 })).toBe("QAda");
    expect(s.active()?.ref).toEqual({ row: 1, col: 1 });
    expect(s.active()?.caret).toBe(0);

    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(s.active()?.ref).toEqual({ row: 1, col: 0 });
    expect(s.active()?.caret).toBe("QAda".length);
  });

  it("ArrowRight at the end enters the next cell; ArrowLeft at 0 returns", async () => {
    const { view: v, surface: s } = await setup();
    s.begin(v, tf(v), { row: 1, col: 0 }, Number.MAX_SAFE_INTEGER);

    await userEvent.keyboard("{ArrowRight}");
    expect(s.active()?.ref).toEqual({ row: 1, col: 1 });
    expect(s.active()?.caret).toBe(0);

    await userEvent.keyboard("{ArrowLeft}");
    expect(s.active()?.ref).toEqual({ row: 1, col: 0 });
    expect(s.active()?.caret).toBe("Ada".length);
  });

  it("ArrowDown from the last row exits below the table", async () => {
    const { view: v, surface: s } = await setup();
    const model = { to: cellRange(v.state, tf(v), { row: 2, col: 1 })!.to + 2 };
    s.begin(v, tf(v), { row: 2, col: 0 }, 0);

    await userEvent.keyboard("{ArrowDown}");
    expect(s.active()).toBeNull();
    expect(v.state.selection.main.head).toBe(model.to + 1);
  });

  it("ArrowUp from the header exits above the table", async () => {
    const { view: v, surface: s } = await setup();
    s.begin(v, tf(v), { row: 0, col: 0 }, 0);

    await userEvent.keyboard("{ArrowUp}");
    expect(s.active()).toBeNull();
    expect(v.state.selection.main.head).toBe(tf(v) - 1);
  });

  it("Backspace at offset 0 navigates to the previous cell without merging", async () => {
    const { view: v, surface: s } = await setup();
    const before = v.state.doc.toString();
    s.begin(v, tf(v), { row: 1, col: 1 }, 0);

    await userEvent.keyboard("{Backspace}");
    expect(s.active()?.ref).toEqual({ row: 1, col: 0 });
    expect(s.active()?.caret).toBe("Ada".length);
    expect(v.state.doc.toString()).toBe(before);
  });

  it("Enter commits and moves down the column", async () => {
    const { view: v, surface: s } = await setup();
    s.begin(v, tf(v), { row: 1, col: 0 }, 0);
    await userEvent.keyboard("Q{Enter}");

    expect(cellText(v, { row: 1, col: 0 })).toBe("QAda");
    expect(s.active()?.ref).toEqual({ row: 2, col: 0 });
  });
});

describe("entry from the main document", () => {
  it("ArrowDown on the line directly above enters the first header cell", async () => {
    const { view: v, surface: s } = await setup();
    v.focus();
    // The blank line directly above the table.
    v.dispatch({ selection: { anchor: v.state.doc.toString().indexOf("| Name") - 1 } });

    await userEvent.keyboard("{ArrowDown}");
    expect(s.active()?.ref).toEqual({ row: 0, col: 0 });
    expect(document.activeElement).toBe(s.editingElement());
  });

  it("ArrowUp on the line directly below enters the last row", async () => {
    const { view: v, surface: s } = await setup();
    v.focus();
    // The blank line directly below the table.
    const outro = v.state.doc.toString().indexOf("outro");
    v.dispatch({ selection: { anchor: outro - 1 } });

    await userEvent.keyboard("{ArrowUp}");
    expect(s.active()?.ref).toEqual({ row: 2, col: 0 });
  });
});
