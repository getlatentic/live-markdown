// @vitest-environment jsdom
import type { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor, text } from "./editorTestHarness";
import {
  IMAGE_EDIT_ALT_EVENT,
  showImageActionMenu,
  type ImageEditAltEventDetail,
} from "./imageActionMenu";

function openMenu(view: EditorView, from: number, to: number): HTMLElement {
  showImageActionMenu({
    x: 0,
    y: 0,
    view,
    alt: "alt",
    rawSrc: "images/x.png",
    sourceFrom: from,
    sourceTo: to,
  });
  return document.querySelector(".cm-image-menu") as HTMLElement;
}

function buttons(menu: HTMLElement): HTMLButtonElement[] {
  return [...menu.querySelectorAll("button")];
}

describe("showImageActionMenu", () => {
  afterEach(() => {
    document.querySelectorAll(".cm-image-menu").forEach((m) => m.remove());
    destroyEditors();
  });

  it("renders the four action items as a menu", () => {
    const view = makeEditor("![alt](images/x.png)", 0);
    const menu = openMenu(view, 0, view.state.doc.length);
    expect(menu.getAttribute("role")).toBe("menu");
    expect(buttons(menu).map((b) => b.textContent)).toEqual([
      "Edit alt text…",
      "Replace image…",
      "Copy markdown source",
      "Delete image",
    ]);
  });

  it("Delete image removes the source range from the document", () => {
    const doc = "before ![alt](images/x.png) after";
    const from = doc.indexOf("![");
    const to = doc.indexOf(")") + 1;
    const view = makeEditor(doc, 0);
    const menu = openMenu(view, from, to);
    buttons(menu).find((b) => b.textContent === "Delete image")!.click();
    expect(text(view)).toBe("before  after");
  });

  it("Edit alt text… fires IMAGE_EDIT_ALT_EVENT carrying the source detail", () => {
    const view = makeEditor("![alt](images/x.png)", 0);
    let detail: ImageEditAltEventDetail | null = null;
    const handler = (e: Event) => {
      detail = (e as CustomEvent<ImageEditAltEventDetail>).detail;
    };
    window.addEventListener(IMAGE_EDIT_ALT_EVENT, handler);
    const menu = openMenu(view, 0, view.state.doc.length);
    buttons(menu).find((b) => b.textContent === "Edit alt text…")!.click();
    window.removeEventListener(IMAGE_EDIT_ALT_EVENT, handler);

    expect(detail).not.toBeNull();
    const d = detail as unknown as ImageEditAltEventDetail;
    expect(d.currentAlt).toBe("alt");
    expect(d.rawSrc).toBe("images/x.png");
    expect([d.sourceFrom, d.sourceTo]).toEqual([0, view.state.doc.length]);
  });

  it("clicking an item closes the menu", () => {
    const view = makeEditor("![alt](images/x.png)", 0);
    const menu = openMenu(view, 0, view.state.doc.length);
    buttons(menu).find((b) => b.textContent === "Delete image")!.click();
    expect(document.querySelector(".cm-image-menu")).toBeNull();
  });
});
