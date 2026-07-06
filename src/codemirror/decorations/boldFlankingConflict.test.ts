// @vitest-environment jsdom
// Reproduce the LIVE bug: formatCommands.toggleBold is correct in isolation,
// but the live editor ALSO runs flankingGuard (a transactionFilter). Two
// independent fixes for the same edge-whitespace issue, from two branches,
// now both active. This test runs them TOGETHER, as the live editor does.
import { afterEach, describe, expect, it } from "vitest";
import { EditorSelection } from "@codemirror/state";

import { destroyEditors, makeEditor, text } from "./editorTestHarness";
import { formatCommands } from "./formatCommands";
import { flankingGuard } from "./flankingGuard";

describe("bold + flankingGuard together (live extension set)", () => {
  afterEach(destroyEditors);

  it("toggleBold on 'alpha ' WITH flankingGuard active", () => {
    const view = makeEditor("alpha beta", 0, [flankingGuard]);
    view.dispatch({ selection: EditorSelection.range(0, 6) }); // "alpha "
    formatCommands.toggleBold(view);
    // Correct would be "**alpha** beta". The live app produced "**alpha **beta".
    expect(text(view)).toBe("**alpha** beta");
  });
});
