// @vitest-environment jsdom
import { EditorSelection } from "@codemirror/state";
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor, text } from "./editorTestHarness";
import { formatCommands } from "./formatCommands";

function select(view: ReturnType<typeof makeEditor>, from: number, to: number): void {
  view.dispatch({ selection: EditorSelection.range(from, to) });
}

describe("formatCommands — toggle bold / italic / code", () => {
  afterEach(destroyEditors);

  it("wraps a selection in ** and re-selects the content", () => {
    const view = makeEditor("hello", 0);
    select(view, 0, 5);
    formatCommands.toggleBold(view);
    expect(text(view)).toBe("**hello**");
    expect([view.state.selection.main.from, view.state.selection.main.to]).toEqual([2, 7]);
  });

  it("unwraps when the caret is already inside bold (toggle off)", () => {
    const view = makeEditor("**hello**", 4); // caret inside "hello"
    formatCommands.toggleBold(view);
    expect(text(view)).toBe("hello");
  });

  it("inserts empty ** and puts the caret between them on a collapsed selection", () => {
    const view = makeEditor("ab", 1);
    formatCommands.toggleBold(view);
    expect(text(view)).toBe("a****b");
    expect(view.state.selection.main.head).toBe(3); // between the markers
  });

  it("italic uses single * and inline code uses backticks", () => {
    const italic = makeEditor("x", 0);
    select(italic, 0, 1);
    formatCommands.toggleItalic(italic);
    expect(text(italic)).toBe("*x*");

    const code = makeEditor("x", 0);
    select(code, 0, 1);
    formatCommands.toggleInlineCode(code);
    expect(text(code)).toBe("`x`");
  });
});
