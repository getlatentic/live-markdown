/**
 * @browser: editing an ordered item's number with real clicks and keys. Where a
 * click on the drawn number puts the caret is the engine's answer, so the only
 * place it is knowable is a browser with the editor laid out.
 */

import { defaultKeymap } from "@codemirror/commands";
import { keymap, type EditorView } from "@codemirror/view";
import { userEvent } from "@vitest/browser/context";
import { afterEach, describe, expect, it } from "vitest";

import { editorBaseTheme } from "../core";
import { destroyEditors, makeFullEditor } from "../core/editorTestHarness";
import { deleteNormalizerKeymap } from "../interaction/deleteNormalizer";
import { numberEditing } from "./numberEditing";

afterEach(destroyEditors);

const ITEM = "11. we discuss how we evaluate";

function mount(doc: string): EditorView {
  const view = makeFullEditor(doc, doc.length, [editorBaseTheme, numberEditing, deleteNormalizerKeymap, keymap.of(defaultKeymap)]);
  document.body.appendChild(view.dom);
  view.focus();
  return view;
}

function drawnNumbers(view: EditorView): string[] {
  return [...view.contentDOM.querySelectorAll(".cm-ordered-marker")].map((number) => number.textContent ?? "");
}

/** Click the drawn number `index`, at `fraction` of its width. */
async function clickNumber(view: EditorView, fraction: number, index = 0): Promise<void> {
  const number = view.contentDOM.querySelectorAll(".cm-ordered-marker")[index];
  if (!(number instanceof HTMLElement)) throw new Error("no number drawn");
  const box = number.getBoundingClientRect();
  await userEvent.click(number, { position: { x: box.width * fraction, y: box.height / 2 } });
}

async function clickText(view: EditorView, text: string): Promise<void> {
  const line = [...view.contentDOM.querySelectorAll(".cm-line")].find((each) => each.textContent?.includes(text));
  if (!(line instanceof HTMLElement)) throw new Error(`no line with ${text}`);
  await userEvent.click(line, { position: { x: line.getBoundingClientRect().width - 4, y: 6 } });
}

describe("editing an ordered item's number", () => {
  it("takes the digit typed after a Backspace at the number's end, and draws the new number", async () => {
    const view = mount(ITEM);
    await clickNumber(view, 0.95);
    expect(view.state.selection.main.head).toBe(2);
    expect(drawnNumbers(view)).toEqual([]);

    await userEvent.keyboard("{Backspace}5");
    expect(view.state.doc.toString()).toBe("15. we discuss how we evaluate");

    await clickText(view, "evaluate");
    expect(drawnNumbers(view)).toEqual(["15."]);
  });

  it("puts the caret between the digits a click falls between", async () => {
    const view = mount(ITEM);
    await clickNumber(view, 0.4);
    await userEvent.keyboard("4");
    expect(view.state.doc.toString()).toBe("141. we discuss how we evaluate");
  });

  it("confirms the number on Enter, with the caret at the item's text and no new item", async () => {
    const view = mount(ITEM);
    await clickNumber(view, 0.95);
    await userEvent.keyboard("{Backspace}5{Enter}");
    expect(view.state.doc.toString()).toBe("15. we discuss how we evaluate");
    expect(view.state.selection.main.head).toBe(4);
    expect(drawnNumbers(view)).toEqual(["15."]);
  });

  it("keeps an emptied number open for the new one", async () => {
    const view = mount(ITEM);
    await clickNumber(view, 0.95);
    await userEvent.keyboard("{Backspace}{Backspace}7{Enter}");
    expect(view.state.doc.toString()).toBe("7. we discuss how we evaluate");
    expect(drawnNumbers(view)).toEqual(["7."]);
  });

  it("still draws a later item by its place in the list, as every Markdown reader shows it", async () => {
    const view = mount("1. first\n2. second");
    await clickNumber(view, 0.95, 1);
    await userEvent.keyboard("{Backspace}9{Enter}");
    expect(view.state.doc.toString()).toBe("1. first\n9. second");
    expect(drawnNumbers(view)).toEqual(["1.", "2."]);
  });
});
