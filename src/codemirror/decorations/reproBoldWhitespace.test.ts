// @vitest-environment jsdom
// Repro of the LIVE report: select a word WITH trailing whitespace, Cmd+B.
// Expected: markers hug the word (**hello** world) so CommonMark parses it as
// strong and the marker-hide decoration hides the ``**``. If the space lands
// INSIDE the markers (**hello ** world) the emphasis is invalid → not parsed
// → ``**`` renders as literal text = "markdown revealed".
import { afterEach, describe, expect, it } from "vitest";
import { EditorSelection } from "@codemirror/state";

import { destroyEditors, makeEditor, text } from "./editorTestHarness";
import { formatCommands } from "./formatCommands";

describe("REPRO — bold with edge whitespace (live report)", () => {
  afterEach(destroyEditors);

  it("trailing space: 'hello ' selected → **hello** world", () => {
    const view = makeEditor("hello world", 0);
    view.dispatch({ selection: EditorSelection.range(0, 6) }); // "hello "
    formatCommands.toggleBold(view);
    expect(text(view)).toBe("**hello** world");
  });

  it("leading space: ' world' selected → hello **world**", () => {
    const view = makeEditor("hello world", 0);
    view.dispatch({ selection: EditorSelection.range(5, 11) }); // " world"
    formatCommands.toggleBold(view);
    expect(text(view)).toBe("hello **world**");
  });

  it("both edges: ' hello ' selected → **hello** with spaces outside", () => {
    const view = makeEditor("a hello b", 0);
    view.dispatch({ selection: EditorSelection.range(1, 8) }); // " hello "
    formatCommands.toggleBold(view);
    expect(text(view)).toBe("a **hello** b");
  });
});
