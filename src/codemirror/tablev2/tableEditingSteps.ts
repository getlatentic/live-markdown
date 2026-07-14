/**
 * Step definitions for features/browser/table-editing.feature — the ADR 0001
 * interaction contract, executed against the REAL tablev2 stack in WebKit.
 *
 * Registered once as a shared pool (defineSteps); every scenario draws the
 * steps it needs, so the feature file stays the single source of truth.
 * Scenario-scoped state lives in `ctx`, reset by the Background step.
 */

import { history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defineSteps } from "@amiceli/vitest-cucumber";
import { userEvent } from "@vitest/browser/context";
import { expect, vi } from "vitest";

import { drawnCaret } from "../caretLayer";
import { cellAt, rowCount } from "../table/tableCellNav";
import {
  addColumnAfter,
  addRowBelow,
  deleteColumn,
  deleteRow,
  deleteTable,
} from "../table/tableEditCommands";
import { modelAt } from "../table/tableGeometry";
import { ZWSP } from "../features/blockCommandSteps";
import {
  type BridgeAction,
  type BridgeInput,
  type BridgeKey,
  bridgeKey,
} from "./bridgeRules";
import { type CellRef, cellElement, cellRange } from "./cellEditingSurface";
import { InlineCellSurface } from "./inlineCellSurface";
import { SELECTED_CLASS, columnRect, refsIn } from "./tableV2Selection";
import { tableV2 } from "./tableWidgetV2";
import { tableV2Interaction } from "./tableV2Interaction";

interface Ctx {
  view: EditorView;
  surface: InlineCellSurface;
  backgroundDoc: string;
  savedMainHead: number;
  layerHiddenDuringEdits: boolean;
  bridgeInput: BridgeInput | null;
  bridgeAction: BridgeAction | null;
  selectionSet: CellRef[] | null;
  copied: string | null;
}

let ctx: Ctx | null = null;

export function cleanupTableSteps(): void {
  ctx?.surface.cancel();
  ctx?.view.destroy();
  ctx = null;
  document.querySelectorAll(".cm-table-menu").forEach((el) => el.remove());
}

const need = (): Ctx => {
  if (!ctx) throw new Error("Background did not run");
  return ctx;
};

function stripGuards(block: string): string {
  return block.split(ZWSP).join("").replace(/\n$/, "");
}

const tf = (): number => need().view.state.doc.toString().indexOf("| Name");

function model() {
  const m = modelAt(need().view.state, tf());
  if (!m) throw new Error("table not parsed");
  return m;
}

/** The (row, col) of the cell whose source text equals `text`. */
function refByText(text: string): CellRef {
  const m = model();
  const { view } = need();
  for (let row = 0; row < rowCount(m); row++) {
    for (let col = 0; col < m.data.header.length; col++) {
      const cell = cellAt(m, row, col);
      if (cell && view.state.sliceDoc(cell.from, cell.to) === text) return { row, col };
    }
  }
  throw new Error(`no cell with text "${text}"`);
}

function tdOf(ref: CellRef): HTMLElement {
  const el = cellElement(need().view, tf(), ref);
  if (!el) throw new Error(`cell ${ref.row},${ref.col} not rendered`);
  return el;
}

function mouse(type: string, el: Element, at?: { x: number; y: number }): void {
  const rect = el.getBoundingClientRect();
  el.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: at?.x ?? rect.left + rect.width / 2,
      clientY: at?.y ?? rect.top + rect.height / 2,
    }),
  );
}

const clickCell = (ref: CellRef): void => {
  const el = tdOf(ref);
  mouse("mousedown", el);
  mouse("mouseup", el);
};

async function press(name: string): Promise<void> {
  const map: Record<string, string> = {
    ArrowDown: "{ArrowDown}",
    ArrowUp: "{ArrowUp}",
    ArrowRight: "{ArrowRight}",
    ArrowLeft: "{ArrowLeft}",
    Tab: "{Tab}",
    "Shift-Tab": "{Shift>}{Tab}{/Shift}",
    Backspace: "{Backspace}",
    Enter: "{Enter}",
    "Mod-z": "{Meta>}z{/Meta}",
  };
  const seq = map[name];
  if (!seq) throw new Error(`no key mapping for "${name}"`);
  await userEvent.keyboard(seq);
}

const COMMANDS = {
  "add row below": addRowBelow,
  "add column after": addColumnAfter,
  "delete row": deleteRow,
  "delete column": deleteColumn,
  "delete table": deleteTable,
} as const;

function dragSelect(from: CellRef, to: CellRef): void {
  mouse("mousedown", tdOf(from));
  mouse("mousemove", tdOf(to));
  mouse("mouseup", tdOf(to));
}

const selectedEls = () =>
  need().view.dom.querySelectorAll(`.${SELECTED_CLASS}`);

export function defineTableSteps(): void {
  defineSteps(({ Given, When, Then, And }) => {
    Given("a document with prose around this table:", async (_c: unknown, table: string) => {
      cleanupTableSteps();
      const doc = `intro prose\n\n${stripGuards(table)}\n\noutro prose`;
      const surface = new InlineCellSurface();
      const state = EditorState.create({
        doc,
        extensions: [
          history(),
          keymap.of(historyKeymap),
          drawnCaret,
          markdown({ base: markdownLanguage }),
          tableV2(surface),
          tableV2Interaction(surface),
        ],
      });
      ensureSyntaxTree(state, doc.length, 5000);
      const view = new EditorView({ state, parent: document.body });
      ctx = {
        view,
        surface,
        backgroundDoc: doc,
        savedMainHead: view.state.selection.main.head,
        layerHiddenDuringEdits: true,
        bridgeInput: null,
        bridgeAction: null,
        selectionSet: null,
        copied: null,
      };
      await vi.waitFor(() => {
        if (!view.dom.querySelector("[data-tablev2-from]")) throw new Error("widget pending");
      });
    });

    // ── caret placement ──────────────────────────────────────────────
    Given("the caret is on the line directly above the table", () => {
      const { view } = need();
      view.focus();
      view.dispatch({ selection: { anchor: tf() - 1 } });
    });
    Given("the caret is in the {string} cell", (_c: unknown, text: string) => {
      const { surface, view } = need();
      expect(surface.begin(view, tf(), refByText(text), 0)).toBe(true);
    });
    Given(
      "the caret is in the {string} cell at offset {int}",
      (_c: unknown, text: string, offset: number) => {
        const { surface, view } = need();
        expect(surface.begin(view, tf(), refByText(text), offset)).toBe(true);
      },
    );
    Given("the main caret is parked in the prose above the table", () => {
      const { view } = need();
      view.dispatch({ selection: { anchor: 2 } });
      need().savedMainHead = 2;
    });

    // ── key presses ──────────────────────────────────────────────────
    When("I press {string}", async (_c: unknown, name: string) => {
      if (name === "Mod-z" && !need().surface.active()) need().view.focus();
      await press(name);
    });

    // ── caret assertions ─────────────────────────────────────────────
    Then("the caret is inside the {string} cell", (_c: unknown, text: string) => {
      const { surface } = need();
      expect(surface.active()?.ref).toEqual(refByText(text));
      expect(document.activeElement).toBe(surface.editingElement());
    });
    Then(
      "the caret is in the {string} cell at offset {int}",
      (_c: unknown, text: string, offset: number) => {
        const { surface } = need();
        expect(surface.active()?.ref).toEqual(refByText(text));
        expect(surface.active()?.caret).toBe(offset);
      },
    );
    Then("the caret is in the main document directly below the table", () => {
      const { surface, view } = need();
      expect(surface.active()).toBeNull();
      expect(view.state.selection.main.head).toBe(model().to + 1);
    });
    Then("the caret is in the main document directly above the table", () => {
      const { surface, view } = need();
      expect(surface.active()).toBeNull();
      expect(view.state.selection.main.head).toBe(model().from - 1);
    });

    // ── clicking ─────────────────────────────────────────────────────
    When(
      "I click between {string} and {string} in the {string} cell",
      (_c: unknown, before: string, _after: string, text: string) => {
        const el = tdOf(refByText(text));
        const textNode = el.firstChild;
        if (!textNode) throw new Error("cell has no text");
        const probe = document.createRange();
        probe.setStart(textNode, before.length);
        probe.setEnd(textNode, before.length + 1);
        const rect = probe.getBoundingClientRect();
        const at = { x: rect.left + Math.min(2, rect.width / 4), y: rect.top + rect.height / 2 };
        mouse("mousedown", el, at);
        mouse("mouseup", el, at);
      },
    );
    And("typing {string} produces {string} in that cell", async (_c: unknown, ch: string, out: string) => {
      await userEvent.keyboard(ch);
      expect(need().surface.active()?.text).toBe(out);
    });

    Given("the table has an empty row", async () => {
      const { view } = need();
      const pos = cellRange(view.state, tf(), refByText("Lin"))!.from;
      view.dispatch({ changes: addRowBelow(view.state, pos)!, userEvent: "input.table.structure" });
      await vi.waitFor(() => {
        if (!cellElement(view, tf(), { row: 3, col: 0 })) throw new Error("row pending");
      });
      need().savedMainHead = view.state.selection.main.head;
    });
    When("I click the empty row's first cell", () => {
      clickCell({ row: 3, col: 0 });
    });
    Then("that cell has focus and a visible caret", () => {
      const el = need().surface.editingElement();
      expect(el).not.toBeNull();
      expect(document.activeElement).toBe(el);
      const color = getComputedStyle(el!).caretColor;
      expect(color).not.toBe("transparent");
      expect(color).not.toBe("rgba(0, 0, 0, 0)");
    });
    And("the main editor selection did not move", () => {
      expect(need().view.state.selection.main.head).toBe(need().savedMainHead);
    });

    When("I click each body cell of the table in turn", () => {
      const c = need();
      for (const ref of [
        { row: 1, col: 0 },
        { row: 1, col: 1 },
        { row: 2, col: 0 },
        { row: 2, col: 1 },
      ]) {
        clickCell(ref);
        const layer = c.view.dom.querySelector<HTMLElement>(".cm-cursorLayer");
        if (layer && getComputedStyle(layer).display !== "none") {
          c.layerHiddenDuringEdits = false;
        }
      }
    });
    Then("the main editor selection never changes", () => {
      expect(need().view.state.selection.main.head).toBe(need().savedMainHead);
    });
    And("the drawn caret stays hidden while a cell is edited", () => {
      expect(need().layerHiddenDuringEdits).toBe(true);
    });

    // ── bridge (@pure) ───────────────────────────────────────────────
    Given(
      "the bridge state is row {int}, column {int}, offset {int}, length {int}",
      (_c: unknown, row: number, col: number, offset: number, length: number) => {
        need().bridgeInput = {
          rows: 3,
          cols: 2,
          row,
          col,
          offset,
          length,
          onFirstVisualLine: true,
          onLastVisualLine: true,
        };
      },
    );
    When("the bridge receives {string}", (_c: unknown, key: string) => {
      const c = need();
      c.bridgeAction = bridgeKey(c.bridgeInput!, key as BridgeKey);
    });
    Then(
      "the bridge targets row {int}, column {int} at the start",
      (_c: unknown, row: number, col: number) => {
        expect(need().bridgeAction).toEqual({ kind: "focusCell", row, col, caret: "start" });
      },
    );
    Then(
      "the bridge targets row {int}, column {int} at the end",
      (_c: unknown, row: number, col: number) => {
        expect(need().bridgeAction).toEqual({ kind: "focusCell", row, col, caret: "end" });
      },
    );

    // ── structure commands (@pure) ───────────────────────────────────
    When(
      "the {string} command runs from the {string} cell",
      (_c: unknown, name: string, text: string) => {
        const { view } = need();
        const command = COMMANDS[name as keyof typeof COMMANDS];
        if (!command) throw new Error(`no command "${name}"`);
        const pos = cellRange(view.state, tf(), refByText(text))!.from;
        const change = command(view.state, pos);
        expect(change).not.toBeNull();
        view.dispatch({ changes: change!, userEvent: "input.table.structure" });
      },
    );
    Then("the table has {int} body rows", (_c: unknown, n: number) => {
      expect(model().data.rows).toHaveLength(n);
    });
    And("every cell of body row {int} is empty", (_c: unknown, row: number) => {
      // Body rows are 1-based in the feature's phrasing.
      const { view } = need();
      for (const cell of model().data.rows[row - 1]) {
        expect(view.state.sliceDoc(cell.from, cell.to).trim()).toBe("");
      }
    });
    Then("every row has {int} cells", (_c: unknown, n: number) => {
      const m = model();
      expect(m.data.header).toHaveLength(n);
      for (const row of m.data.rows) expect(row).toHaveLength(n);
    });
    Then("every row has {int} cell", (_c: unknown, n: number) => {
      const m = model();
      expect(m.data.header).toHaveLength(n);
      for (const row of m.data.rows) expect(row).toHaveLength(n);
    });
    And("the delimiter row gains one {string} cell", (_c: unknown, dashes: string) => {
      const { view } = need();
      const headerLine = view.state.doc.lineAt(model().from);
      const delimiter = view.state.doc.line(headerLine.number + 1);
      const cells = delimiter.text.split("|").map((s) => s.trim()).filter(Boolean);
      expect(cells).toHaveLength(3);
      for (const cell of cells) expect(cell).toContain(dashes);
    });
    Then(
      "the table has {int} body row and it contains {string}",
      (_c: unknown, n: number, text: string) => {
        const { view } = need();
        const m = model();
        expect(m.data.rows).toHaveLength(n);
        const texts = m.data.rows[0].map((c) => view.state.sliceDoc(c.from, c.to));
        expect(texts).toContain(text);
      },
    );
    And("no cell contains {string}", (_c: unknown, text: string) => {
      expect(need().view.state.doc.toString()).not.toContain(text);
    });
    Then("the table's source lines are gone", () => {
      const doc = need().view.state.doc.toString();
      expect(doc).not.toContain("|");
      expect(doc).not.toContain("---");
    });
    And("the surrounding prose is untouched", () => {
      const doc = need().view.state.doc.toString();
      expect(doc).toContain("intro prose");
      expect(doc).toContain("outro prose");
    });

    // ── selection ────────────────────────────────────────────────────
    When(
      "I press the mouse in the {string} cell and release in the {string} cell",
      (_c: unknown, a: string, b: string) => {
        dragSelect(refByText(a), refByText(b));
      },
    );
    Then(
      "cells {int},{int} through {int},{int} render as selected",
      (_c: unknown, r0: number, c0: number, r1: number, c1: number) => {
        expect(selectedEls()).toHaveLength((r1 - r0 + 1) * (c1 - c0 + 1));
        for (let row = r0; row <= r1; row++) {
          for (let col = c0; col <= c1; col++) {
            expect(tdOf({ row, col }).classList.contains(SELECTED_CLASS)).toBe(true);
          }
        }
      },
    );
    And("the native text selection is empty", () => {
      expect(document.getSelection()?.isCollapsed ?? true).toBe(true);
    });
    Given(
      "cells {int},{int} through {int},{int} are selected",
      (_c: unknown, r0: number, c0: number, r1: number, c1: number) => {
        dragSelect({ row: r0, col: c0 }, { row: r1, col: c1 });
        expect(selectedEls().length).toBeGreaterThan(0);
      },
    );
    When("I copy", () => {
      const dt = new DataTransfer();
      const event = new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true });
      document.dispatchEvent(event);
      need().copied = dt.getData("text/plain");
    });
    Then("the clipboard contains the selected cells as TSV", () => {
      expect(need().copied).toBe("Ada\tEngineer\nLin\tDesigner");
    });
    When("column {int} of a {int}-row grid is selected", (_c: unknown, col: number, rows: number) => {
      need().selectionSet = refsIn(columnRect(rows, col));
    });
    Then(
      "the selection set is cells {int},{int} and {int},{int} and {int},{int}",
      (_c: unknown, ...nums: number[]) => {
        const expected: CellRef[] = [];
        for (let i = 0; i < 6; i += 2) expected.push({ row: nums[i], col: nums[i + 1] });
        expect(need().selectionSet).toEqual(expected);
      },
    );

    // ── menu ─────────────────────────────────────────────────────────
    When("I right-click the {string} cell", (_c: unknown, text: string) => {
      const el = tdOf(refByText(text));
      const rect = el.getBoundingClientRect();
      el.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        }),
      );
    });
    Then("the table menu opens", () => {
      expect(document.querySelector(".cm-table-menu")).not.toBeNull();
    });
    And("I choose {string} from the table menu", (_c: unknown, label: string) => {
      const item = Array.from(document.querySelectorAll(".cm-table-menu button")).find(
        (b) => b.textContent === label,
      );
      if (!item) throw new Error(`no menu item "${label}"`);
      item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    Then("{int} cells render as selected", (_c: unknown, n: number) => {
      expect(selectedEls()).toHaveLength(n);
    });
    And(
      "choosing {string} inserts a row after the {string} row",
      async (_c: unknown, label: string, rowText: string) => {
        const item = Array.from(document.querySelectorAll(".cm-table-menu button")).find(
          (b) => b.textContent === label,
        );
        if (!item) throw new Error(`no menu item "${label}"`);
        item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await vi.waitFor(() => {
          if (model().data.rows.length !== 3) throw new Error("row pending");
        });
        const { view } = need();
        const rows = model().data.rows;
        expect(rows[1].map((c) => view.state.sliceDoc(c.from, c.to))).toContain(rowText);
        for (const cell of rows[2]) {
          expect(view.state.sliceDoc(cell.from, cell.to).trim()).toBe("");
        }
      },
    );

    Then("the {string} cell now contains {string}", (_c: unknown, _cell: string, out: string) => {
      expect(need().surface.active()?.text).toBe(out);
    });
    And("the table structure is unchanged", () => {
      // Nothing was committed: the document is exactly the Background's.
      expect(need().view.state.doc.toString()).toBe(need().backgroundDoc);
    });

    // ── the spike gate, as living spec ───────────────────────────────
    Given(
      "I am typing {string} at the end of the {string} cell",
      async (_c: unknown, typed: string, text: string) => {
        const { surface, view } = need();
        expect(surface.begin(view, tf(), refByText(text), Number.MAX_SAFE_INTEGER)).toBe(true);
        await userEvent.keyboard(typed);
      },
    );
    When("an unrelated document change forces the table widget to update", () => {
      const { view } = need();
      view.dispatch({ changes: { from: 0, insert: "X" } });
    });
    Then("my in-progress text and caret survive", () => {
      const { surface } = need();
      expect(surface.active()?.text).toBe("AdaQ");
      expect(surface.active()?.caret).toBe(4);
      expect(document.activeElement).toBe(surface.editingElement());
    });
    And("further typing still lands at the caret", async () => {
      await userEvent.keyboard("!");
      expect(need().surface.active()?.text).toBe("AdaQ!");
    });
    When(
      "the document changes {string} to {string} externally",
      (_c: unknown, from: string, to: string) => {
        const { view } = need();
        const at = view.state.doc.toString().indexOf(from);
        view.dispatch({ changes: { from: at, to: at + from.length, insert: to } });
      },
    );
    Then(
      "committing my edit produces a table containing both {string} and {string}",
      (_c: unknown, a: string, b: string) => {
        const { surface, view } = need();
        surface.commit(view);
        const doc = view.state.doc.toString();
        expect(doc).toContain(a);
        expect(doc).toContain(b);
      },
    );
    Given(
      "I typed {string} into the {string} cell and committed",
      async (_c: unknown, typed: string, text: string) => {
        const { surface, view } = need();
        surface.begin(view, tf(), refByText(text), Number.MAX_SAFE_INTEGER);
        await userEvent.keyboard(typed);
        surface.commit(view);
        expect(view.state.doc.toString()).toContain(text + typed);
      },
    );
    Then("the table source shows {string} again", (_c: unknown, text: string) => {
      const { view } = need();
      const cell = cellRange(view.state, tf(), refByText(text));
      expect(cell).not.toBeNull();
      expect(view.state.sliceDoc(cell!.from, cell!.to)).toBe(text);
    });
    And("redo restores the committed edit", async () => {
      need().view.focus();
      await userEvent.keyboard("{Meta>}{Shift>}z{/Shift}{/Meta}");
      expect(need().view.state.doc.toString()).toContain("AdaX");
    });
  });
}
