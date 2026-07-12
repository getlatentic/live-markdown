// balancedSlice (#140): a selection made by eye starts at the first VISIBLE
// character — in source that's just past the hidden opening marker — and the
// naive slice shipped an orphaned `**` to every receiver. The reporter's
// exact case: copying `**Priorties**` from its visible start pasted
// "Priorties**" into Slack and Docs.
import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";

import { balancedSlice } from "./copyRich";

function stateOf(doc: string): EditorState {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage })],
  });
  ensureSyntaxTree(state, doc.length, 5000);
  return state;
}

describe("balancedSlice", () => {
  it("repairs the opening marker when the selection starts at the visible start of bold (#140)", () => {
    const doc = "**Priorties**\n\nGoal";
    const state = stateOf(doc);
    // The visible 'P' is at source offset 2 — after the hidden `**`.
    expect(balancedSlice(state, 2, doc.indexOf("\n"))).toBe("**Priorties**");
  });

  it("repairs the closing marker when the selection ends at the visible end", () => {
    const state = stateOf("intro **bold tail**");
    // Select from doc start to just before the hidden closing `**`.
    expect(balancedSlice(state, 0, "intro **bold tail".length)).toBe("intro **bold tail**");
  });

  it("keeps formatting for a strictly-inside selection — the screen shows it bold", () => {
    const state = stateOf("**Priorties**");
    // "riort" renders bold in the editor, so the copy carries bold too.
    expect(balancedSlice(state, 3, 8)).toBe("**riort**");
  });

  it("leaves fully-covered constructs alone", () => {
    const doc = "a **b** c";
    const state = stateOf(doc);
    expect(balancedSlice(state, 0, doc.length)).toBe(doc);
  });

  it("repairs nested emphasis outer-to-inner so the result stays well-formed", () => {
    const doc = "***both***";
    const state = stateOf(doc);
    // Visible start of bold+italic content: after `***`.
    expect(balancedSlice(state, 3, doc.length)).toBe("***both***");
  });

  it("preserves the construct's own delimiter style", () => {
    const strike = stateOf("~~gone~~");
    expect(balancedSlice(strike, 2, 8)).toBe("~~gone~~");

    const underscore = stateOf("_soft_");
    expect(balancedSlice(underscore, 1, 6)).toBe("_soft_");

    const code = stateOf("`let x`");
    expect(balancedSlice(code, 1, 7)).toBe("`let x`");
  });

  it("repairs both edges of one construct independently", () => {
    const doc = "**wide bold phrase**";
    const state = stateOf(doc);
    // Visible-only selection: after opening ** to before closing **.
    expect(balancedSlice(state, 2, doc.length - 2)).toBe("**wide bold phrase**");
  });
});
