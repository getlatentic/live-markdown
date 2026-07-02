// @vitest-environment jsdom
import { EditorSelection } from "@codemirror/state";
import { afterEach, describe, expect, it } from "vitest";

import { blockCommands } from "./blockCommands";
import { destroyEditors, makeEditor, text } from "./editorTestHarness";

describe("blockCommands — code fence wrapping", () => {
  afterEach(destroyEditors);

  it("wraps the selected lines in a ``` fence", () => {
    const view = makeEditor("plain text", 0);
    view.dispatch({ selection: EditorSelection.range(0, 10) });
    blockCommands.toggleCodeBlock(view);
    expect(text(view)).toBe("```\nplain text\n```");
  });

  it("lengthens the fence past any backtick run in the content", () => {
    // Wrapping this with ``` would close the fence at the inner ``` and spill
    // the rest as prose — the fence must be one backtick longer.
    const view = makeEditor("docs say\n```\nnested\n```", 0);
    view.dispatch({ selection: EditorSelection.range(0, view.state.doc.length) });
    blockCommands.toggleCodeBlock(view);
    expect(text(view)).toBe("````\ndocs say\n```\nnested\n```\n````");
  });
});
