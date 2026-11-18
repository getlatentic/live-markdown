// @vitest-environment jsdom
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import type { CaretContextSnapshot } from "./extensions/types";
import { caretContext, caretContextsEqual, EMPTY_CARET_CONTEXT, watchCaretContext } from "./caretContext";
import { updateBus } from "./updateBus";

const views: EditorView[] = [];
afterEach(() => views.splice(0).forEach((view) => view.destroy()));

function stateAt(doc: string, caret: number): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.cursor(caret),
    extensions: [markdown({ base: markdownLanguage }), updateBus],
  });
}

function contextAt(doc: string, marker: string): CaretContextSnapshot {
  return caretContext(stateAt(doc, doc.indexOf(marker)));
}

describe("which toolbar buttons look pressed", () => {
  it("compares every field it has", () => {
    // A field left out of the comparison freezes that button at the previous
    // caret's value.
    for (const key of Object.keys(EMPTY_CARET_CONTEXT) as (keyof CaretContextSnapshot)[]) {
      const changed = { ...EMPTY_CARET_CONTEXT, [key]: key === "heading" ? 3 : true };
      expect(caretContextsEqual(EMPTY_CARET_CONTEXT, changed), `${key} is not compared`).toBe(false);
    }
    expect(caretContextsEqual({ ...EMPTY_CARET_CONTEXT }, { ...EMPTY_CARET_CONTEXT })).toBe(true);
  });
});

describe("reading the caret's context from the document", () => {
  it("reports a task as a task and not as a bullet", () => {
    expect(contextAt("- [ ] a task", "task")).toMatchObject({ taskList: true, bulletList: false });
    expect(contextAt("- plain item", "plain")).toMatchObject({ taskList: false, bulletList: true });
  });

  it("reads the heading level", () => {
    for (const level of [1, 2, 3, 4, 5, 6]) {
      expect(contextAt(`${"#".repeat(level)} Title`, "Title").heading).toBe(level);
    }
    expect(contextAt("plain text", "text").heading).toBe(0);
  });

  it("reads inline marks and blocks around the caret", () => {
    expect(contextAt("some **strong** text", "strong").bold).toBe(true);
    expect(contextAt("some *soft* text", "soft").italic).toBe(true);
    expect(contextAt("some `snippet` text", "snippet").code).toBe(true);
    expect(contextAt("a [link](https://x.y) here", "link").link).toBe(true);
    expect(contextAt("1. counted", "counted").orderedList).toBe(true);
    expect(contextAt("> quoted", "quoted").blockquote).toBe(true);
  });

  it("reports nothing for plain prose", () => {
    expect(contextAt("just words", "words")).toEqual(EMPTY_CARET_CONTEXT);
  });

  it("reads a caret far below what a viewport would have parsed", () => {
    const filler = Array.from({ length: 400 }, (_, i) => `paragraph line ${i}`).join("\n\n");
    const doc = `${filler}\n\n**hello**`;
    expect(caretContext(stateAt(doc, doc.length - 4)).bold).toBe(true);
  });
});

describe("watchCaretContext", () => {
  function viewAt(doc: string, caret: number): EditorView {
    const view = new EditorView({ state: stateAt(doc, caret), parent: document.body });
    views.push(view);
    return view;
  }

  it("reports at once, and again only when the context changes", () => {
    const doc = "plain **bold**";
    const view = viewAt(doc, 1);
    const reports: CaretContextSnapshot[] = [];
    watchCaretContext(view, (context) => reports.push(context));
    view.dispatch({ changes: { from: 1, insert: "x" } });
    view.dispatch({ selection: { anchor: 2 } });
    expect(reports).toEqual([EMPTY_CARET_CONTEXT]);
    view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf("bold") } });
    expect(reports.map((context) => context.bold)).toEqual([false, true]);
  });

  it("stops reporting once unsubscribed", () => {
    const view = viewAt("plain **bold**", 1);
    const reports: CaretContextSnapshot[] = [];
    const stop = watchCaretContext(view, (context) => reports.push(context));
    stop();
    view.dispatch({ selection: { anchor: 10 } });
    expect(reports).toHaveLength(1);
  });
});
