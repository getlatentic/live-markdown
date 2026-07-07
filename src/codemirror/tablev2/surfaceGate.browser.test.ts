/**
 * The ADR 0001 editing-surface decision gate, run in real WebKit.
 *
 * Both surfaces run the SAME conditions:
 *   G1  — an unrelated doc change (offsets shift → widget PATCH via updateDOM)
 *         must not lose the in-progress text, caret, or focus.
 *   G1b — a table-shape change (external add-row → updateDOM declines → full
 *         widget RECREATE) must not lose the edit either.
 *   G2  — an external edit to ANOTHER cell mid-edit merges cleanly on commit.
 *   G3  — 20 scripted begin→type→commit rounds across cells with zero focus or
 *         content casualties.
 *
 * A surface that fails a condition fails the gate; the ADR records the result.
 */

import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { userEvent } from "@vitest/browser/context";
import { afterEach, describe, expect, it, vi } from "vitest";

import { addRowBelow } from "../decorations/tableEditCommands";
import { type CellEditingSurface, type CellRef, cellElement, cellRange } from "./cellEditingSurface";
import { InlineCellSurface } from "./inlineCellSurface";
import { OverlayCellSurface } from "./overlayCellSurface";
import { tableV2 } from "./tableWidgetV2";

const DOC = `intro prose

| Name | Role |
| --- | --- |
| Ada | Engineer |
| Lin | Designer |

outro prose`;

const ADA: CellRef = { row: 1, col: 0 };

let view: EditorView | null = null;
let surface: CellEditingSurface | null = null;

async function setup(kind: "inline" | "overlay") {
  surface = kind === "inline" ? new InlineCellSurface() : new OverlayCellSurface();
  const state = EditorState.create({
    doc: DOC,
    extensions: [markdown({ base: markdownLanguage }), tableV2(surface)],
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
  document.querySelectorAll(".cm-tablev2-overlay").forEach((el) => el.remove());
});

function tableFrom(v: EditorView): number {
  return v.state.doc.toString().indexOf("| Name");
}

/** The element that should own focus while `ref` is being edited. */
function editingElement(kind: string, v: EditorView, tf: number, ref: CellRef): HTMLElement {
  const el =
    kind === "inline"
      ? cellElement(v, tf, ref)
      : document.querySelector<HTMLElement>(".cm-tablev2-overlay");
  if (!el) throw new Error("editing element missing");
  return el;
}

function cellSource(v: EditorView, tf: number, ref: CellRef): string {
  const range = cellRange(v.state, tf, ref);
  return range ? v.state.sliceDoc(range.from, range.to) : "<unresolved>";
}

for (const kind of ["inline", "overlay"] as const) {
  describe(`surface gate — ${kind}`, () => {
    it("G1: widget PATCH mid-edit preserves text, caret, and focus", async () => {
      const { view: v, surface: s } = await setup(kind);
      const tf = tableFrom(v);
      expect(s.begin(v, tf, ADA, 3)).toBe(true);
      const tdBefore = cellElement(v, tf, ADA);
      await userEvent.keyboard("2");
      expect(s.active()?.text).toBe("Ada2");
      expect(s.active()?.caret).toBe(4);

      // Unrelated change before the table: every offset shifts, eq() fails,
      // updateDOM patches every cell from (pre-commit) data.
      v.dispatch({ changes: { from: 0, insert: "X" } });

      // Path proof: PATCH keeps element identity.
      expect(cellElement(v, tableFrom(v), ADA)).toBe(tdBefore);

      expect(s.active()?.text).toBe("Ada2");
      expect(s.active()?.caret).toBe(4);
      const el = editingElement(kind, v, tableFrom(v), ADA);
      expect(document.activeElement).toBe(el);

      // The edit must still be LIVE: more typing lands at the caret.
      await userEvent.keyboard("Z");
      expect(s.active()?.text).toBe("Ada2Z");
    });

    it("G1b: full widget RECREATE mid-edit preserves the edit", async () => {
      const { view: v, surface: s } = await setup(kind);
      const tf = tableFrom(v);
      expect(s.begin(v, tf, ADA, 3)).toBe(true);
      const tdBefore = cellElement(v, tf, ADA);
      await userEvent.keyboard("2");

      // External structure change below the edited row: the grid shape
      // changes, updateDOM declines, CM destroys and rebuilds the DOM.
      const lastRowPos = cellRange(v.state, tf, { row: 2, col: 0 })!.from;
      const change = addRowBelow(v.state, lastRowPos);
      expect(change).not.toBeNull();
      v.dispatch({ changes: change!, userEvent: "input.table.structure" });

      // Path proof: RECREATE replaces the element.
      expect(cellElement(v, tableFrom(v), ADA)).not.toBe(tdBefore);

      expect(s.active()?.text).toBe("Ada2");
      expect(s.active()?.caret).toBe(4);
      const el = editingElement(kind, v, tableFrom(v), ADA);
      expect(document.activeElement).toBe(el);
      await userEvent.keyboard("Z");
      expect(s.active()?.text).toBe("Ada2Z");
    });

    it("G2: an external edit to another cell merges cleanly on commit", async () => {
      const { view: v, surface: s } = await setup(kind);
      const tf = tableFrom(v);
      expect(s.begin(v, tf, ADA, 3)).toBe(true);
      await userEvent.keyboard("2");

      const at = v.state.doc.toString().indexOf("Designer");
      v.dispatch({ changes: { from: at, to: at + "Designer".length, insert: "Writer" } });

      s.commit(v);
      const doc = v.state.doc.toString();
      expect(doc).toContain("Ada2");
      expect(doc).toContain("Writer");
      // The table still parses as a 2-column grid with both edits in place.
      expect(cellSource(v, tableFrom(v), ADA)).toBe("Ada2");
      expect(cellSource(v, tableFrom(v), { row: 2, col: 1 })).toBe("Writer");
    });

    it("G3: 20 begin→type→commit rounds, zero casualties", async () => {
      const { view: v, surface: s } = await setup(kind);
      const cycle: CellRef[] = [
        { row: 1, col: 0 },
        { row: 1, col: 1 },
        { row: 2, col: 0 },
        { row: 2, col: 1 },
      ];
      const letters = "abcdefghijklmnopqrst";
      for (let round = 0; round < 20; round++) {
        const ref = cycle[round % cycle.length];
        const tf = tableFrom(v);
        expect(s.begin(v, tf, ref, 0), `round ${round}: begin`).toBe(true);
        const el = editingElement(kind, v, tf, ref);
        expect(document.activeElement, `round ${round}: focus after begin`).toBe(el);

        await userEvent.keyboard(letters[round]);
        expect(s.active()?.text.startsWith(letters[round]), `round ${round}: typed`).toBe(true);

        s.commit(v);
        expect(
          cellSource(v, tableFrom(v), ref).startsWith(letters[round]),
          `round ${round}: committed`,
        ).toBe(true);
      }
    });
  });
}
