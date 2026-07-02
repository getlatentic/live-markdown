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

describe("formatCommands — flanking-safe wrapping (CommonMark)", () => {
  afterEach(destroyEditors);

  it("keeps a trailing space outside the markers — `**compose **` would be literal text", () => {
    const view = makeEditor("compose next", 0);
    select(view, 0, 8); // "compose " incl. the trailing space
    formatCommands.toggleBold(view);
    expect(text(view)).toBe("**compose** next");
    // The re-selection covers just the wrapped core.
    expect([view.state.selection.main.from, view.state.selection.main.to]).toEqual([2, 9]);
  });

  it("keeps a leading space outside the markers too", () => {
    const view = makeEditor("say compose", 0);
    select(view, 3, 11); // " compose" incl. the leading space
    formatCommands.toggleItalic(view);
    expect(text(view)).toBe("say *compose*");
  });

  it("does nothing for an all-whitespace selection", () => {
    const view = makeEditor("a   b", 0);
    select(view, 1, 4);
    formatCommands.toggleBold(view);
    expect(text(view)).toBe("a   b");
  });

  it("code spans wrap verbatim — backticks have no flanking rule", () => {
    const view = makeEditor("run cmd", 0);
    select(view, 4, 7);
    // Include no spaces here, but prove the code path is untrimmed by selecting
    // with an edge space and expecting it INSIDE the backticks.
    const spaced = makeEditor("run cmd ", 0);
    select(spaced, 4, 8); // "cmd " incl. trailing space
    formatCommands.toggleInlineCode(spaced);
    expect(text(spaced)).toBe("run `cmd `");
    void view;
  });
});
