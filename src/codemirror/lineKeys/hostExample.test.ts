// @vitest-environment jsdom
/**
 * A host's rules under the same checks as the editor's. The module here is
 * a definition list: a line that starts `: `. It is explored with the
 * editor, its rows are kept in `model/host-example/`, and CI runs TLC on
 * the rules it makes.
 */
import { beforeAll, describe, expect, it } from "vitest";

import type { MarkdownExtension } from "../extensions/types";
import { checkLineKeys, type LineKeyReport } from "./check";
import { kindOfLine } from "./lineKind";

const MARKER = ": ";

export const definitions: MarkdownExtension = {
  name: "definitions",
  version: "1.0.0",
  // Only where the editor reads plain text: in a list or a quote the line
  // is theirs, and their rules decide it.
  lineKinds: [
    (state, line) =>
      line.text.startsWith(MARKER) && kindOfLine(state, line.number) === "paragraph" ? { kind: "definition", textFrom: line.from + MARKER.length } : null,
  ],
  lineKeys: [
    // Enter at the end of a definition starts the next one.
    {
      key: "Enter",
      line: "definition",
      at: "end",
      run(view, { pos }) {
        view.dispatch({ changes: { from: pos, insert: `\n${MARKER}` }, selection: { anchor: pos + 1 + MARKER.length } });
        return true;
      },
    },
    // Backspace in front of a definition's text takes its marker, as it
    // takes a list item's: without it the Enter above cannot be undone in
    // two presses, and the model says so.
    {
      key: "Backspace",
      line: "definition",
      at: ["start", "blank"],
      run(view, { line }) {
        view.dispatch({ changes: { from: line.from, to: line.from + MARKER.length }, selection: { anchor: line.from } });
        return true;
      },
    },
  ],
};

let report: LineKeyReport;

beforeAll(async () => {
  report = await checkLineKeys({
    modules: [definitions],
    lines: [
      [MARKER, "word text"],
      [MARKER, ""],
    ],
    keys: ["Backspace", "Enter", "Tab", "Shift-Tab", "Delete"],
  });
}, 900_000);

describe("a host's line-key rules, explored with the editor", () => {
  it("reach the host's kind of line in the table", () => {
    expect(report.table).toContain("definition");
  });

  it("do what the table says", async () => {
    await expect(report.table).toMatchFileSnapshot("../../../model/host-example/line-keys.tsv");
  });

  it("are the machine the TLA+ model checks", async () => {
    await expect(report.tla).toMatchFileSnapshot("../../../model/host-example/LineKeysRules.tla");
  });

  it("leave the caret only where the table has rules", () => {
    expect(report.uncovered).toEqual([]);
  });

  it("hold every check on the table as a whole", () => {
    expect(report.failures).toEqual({});
  });
});
