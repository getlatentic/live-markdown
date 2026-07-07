/**
 * @browser: the code-block language UI (ADR 0002) — pill click opens the
 * chooser, choosing writes the info string as one undo step, right-click
 * offers set-language and copy-code. Real WebKit, real events.
 */

import { history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { userEvent } from "@vitest/browser/context";
import { afterEach, describe, expect, it, vi } from "vitest";

import { codeLanguageUI } from "./codeLangAffordance";

let view: EditorView | null = null;

function makeView(doc: string): EditorView {
  const state = EditorState.create({
    doc,
    extensions: [
      history(),
      keymap.of(historyKeymap),
      markdown({ base: markdownLanguage }),
      codeLanguageUI,
    ],
  });
  ensureSyntaxTree(state, doc.length, 5000);
  view = new EditorView({ state, parent: document.body });
  return view;
}

afterEach(() => {
  view?.destroy();
  view = null;
  document.querySelectorAll(".cm-code-menu").forEach((el) => el.remove());
  vi.restoreAllMocks();
});

function click(el: Element): void {
  const rect = el.getBoundingClientRect();
  const at = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  for (const type of ["mousedown", "mouseup", "click"] as const) {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...at }));
  }
}

const menu = () => document.querySelector<HTMLElement>(".cm-code-menu");
const menuItem = (label: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>(".cm-code-menu button")).find(
    (b) => b.textContent?.startsWith(label),
  );

describe("language pill", () => {
  it("clicking the placeholder pill and choosing a language writes the info string", async () => {
    const v = makeView("```\nconst x = 1\n```");
    const pill = v.dom.querySelector(".cm-code-info--unset");
    expect(pill).not.toBeNull();
    click(pill!);
    expect(menu()).not.toBeNull();

    await userEvent.fill(menu()!.querySelector("input")!, "typescript");
    menuItem("TypeScript")!.click();

    expect(v.state.doc.toString()).toBe("```ts\nconst x = 1\n```");
    expect(menu()).toBeNull();
  });

  it("the change is one undo step", async () => {
    const v = makeView("```\ncode\n```");
    click(v.dom.querySelector(".cm-code-info--unset")!);
    menuItem("Plain text")!.click();
    // Plain on plain: no doc change dispatched at all.
    expect(v.state.doc.toString()).toBe("```\ncode\n```");

    click(v.dom.querySelector(".cm-code-info--unset")!);
    await userEvent.fill(menu()!.querySelector("input")!, "javascript");
    menuItem("JavaScript")!.click();
    expect(v.state.doc.toString()).toBe("```js\ncode\n```");

    v.focus();
    await userEvent.keyboard("{Meta>}z{/Meta}");
    expect(v.state.doc.toString()).toBe("```\ncode\n```");
  });

  it("Enter in the search picks the top match", async () => {
    const v = makeView("```\ncode\n```");
    click(v.dom.querySelector(".cm-code-info--unset")!);
    const input = menu()!.querySelector("input")!;
    await userEvent.fill(input, "rust");
    await userEvent.keyboard("{Enter}");
    expect(v.state.doc.toString()).toBe("```rust\ncode\n```");
  });
});

describe("block right-click menu", () => {
  it("offers Set language… and Copy code; copy writes the block content", async () => {
    const v = makeView("```js\nconst x = f(1)\n```");
    const written: string[] = [];
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (t: string) => {
      written.push(t);
    });

    const line = v.dom.querySelector(".cm-line");
    line!.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }),
    );
    // The handler resolves the fence from event coords; aim at the code line.
    const codeCoords = v.coordsAtPos(v.state.doc.toString().indexOf("const"))!;
    document.querySelectorAll(".cm-code-menu").forEach((el) => el.remove());
    v.dom
      .querySelector(".cm-content")!
      .dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: codeCoords.left + 2,
          clientY: (codeCoords.top + codeCoords.bottom) / 2,
        }),
      );
    expect(menu()).not.toBeNull();
    expect(menuItem("Set language…")).toBeDefined();

    menuItem("Copy code")!.click();
    expect(written).toEqual(["const x = f(1)"]);
    expect(menu()).toBeNull();
  });
});
