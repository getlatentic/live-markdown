// @vitest-environment jsdom
import { Decoration } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "../core/editorTestHarness";
import { mathPlugin } from "./mathPlugin";

function atomic(view: EditorView): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  view.state.field(mathPlugin).atomic.between(0, view.state.doc.length, (from, to) => {
    out.push([from, to]);
  });
  return out;
}

/** Whether the decoration covering [from,to) is a CM6 block-level replacement. */
function isBlockReplace(view: EditorView, from: number, to: number): boolean {
  let block = false;
  view.state.field(mathPlugin).decorations.between(from, to, (f, t, deco) => {
    if (f === from && t === to) block = (deco as Decoration).spec.block === true;
  });
  return block;
}

describe("mathPlugin", () => {
  afterEach(destroyEditors);

  it("replaces inline $…$ with an atomic widget over the whole span", () => {
    const doc = "a $x+1$ b";
    const view = makeEditor(doc, 0, [mathPlugin]);
    const start = doc.indexOf("$"); // 2
    const end = doc.lastIndexOf("$") + 1; // 7
    expect(atomic(view)).toContainEqual([start, end]);
  });

  it("replaces a $$…$$ block line atomically across the whole line", () => {
    const view = makeEditor("$$E=mc^2$$", 0, [mathPlugin]);
    expect(atomic(view)).toContainEqual([0, view.state.doc.length]);
  });

  it("replaces a multi-line $$ … $$ block atomically over all its lines", () => {
    const doc = "before\n$$\n1 \\times 60 = 60\n$$\nafter";
    const view = makeEditor(doc, 0, [mathPlugin]);
    const open = doc.indexOf("$$");
    const close = doc.lastIndexOf("$$") + "$$".length;
    expect(atomic(view)).toContainEqual([open, close]);
  });

  it("makes a multi-line block a CM6 block replacement (renders across line breaks)", () => {
    // A replace spanning line breaks MUST be `block: true`; a real layout engine
    // renders a non-block cross-break replace as raw source. Regression guard.
    const doc = "before\n$$\n\\begin{array}{r|r}\n2 & 60 \\\\ \\hline & 1\n\\end{array}\n$$\nafter";
    const view = makeEditor(doc, 0, [mathPlugin]);
    const open = doc.indexOf("$$");
    const close = doc.lastIndexOf("$$") + "$$".length;
    expect(isBlockReplace(view, open, close)).toBe(true);
  });

  it("keeps a single-line $$…$$ as an inline (non-block) replacement", () => {
    const view = makeEditor("$$E=mc^2$$", 0, [mathPlugin]);
    expect(isBlockReplace(view, 0, view.state.doc.length)).toBe(false);
  });

  it("leaves a bare $ (no closing delimiter) untouched", () => {
    const view = makeEditor("price is $5 today", 0, [mathPlugin]);
    expect(atomic(view)).toEqual([]);
  });
});
