/**
 * @browser: the cell caret is VISIBLE while editing (live report: typing and
 * arrows worked but no caret showed). The main editor's drawn-caret layer
 * hides the native caret across the whole content DOM (caret-color:
 * transparent) — cells must win it back, and the drawn caret must not ghost
 * in the prose while a cell edit is active.
 */

import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";

import { drawnCaret } from "../caretLayer";
import { InlineCellSurface } from "./inlineCellSurface";
import { tableV2 } from "./tableWidgetV2";
import { tableV2Interaction } from "./tableV2Interaction";

const DOC = "prose\n\n| A | B |\n| --- | --- |\n| Ada | Eng |";

let view: EditorView | null = null;
let surface: InlineCellSurface | null = null;

async function setup() {
  surface = new InlineCellSurface();
  const state = EditorState.create({
    doc: DOC,
    extensions: [
      drawnCaret,
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

describe("caret visibility in cells (with the drawn-caret layer active)", () => {
  it("the editing cell's caret-color is NOT transparent", async () => {
    const { view: v, surface: s } = await setup();
    const tf = v.state.doc.toString().indexOf("| A");
    expect(s.begin(v, tf, { row: 1, col: 0 }, 1)).toBe(true);
    const el = s.editingElement()!;
    const color = getComputedStyle(el).caretColor;
    expect(color).not.toBe("transparent");
    expect(color).not.toBe("rgba(0, 0, 0, 0)");
  });

  it("the drawn caret layer is hidden while a cell edit is active, back after", async () => {
    const { view: v, surface: s } = await setup();
    const tf = v.state.doc.toString().indexOf("| A");
    s.begin(v, tf, { row: 1, col: 0 }, 0);
    const layer = v.dom.querySelector<HTMLElement>(".cm-cursorLayer");
    expect(layer).not.toBeNull();
    expect(getComputedStyle(layer!).display).toBe("none");

    s.commit(v);
    expect(getComputedStyle(layer!).display).not.toBe("none");
  });
});
