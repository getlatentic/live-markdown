// @vitest-environment jsdom
/**
 * The line-key machine: what Backspace, Enter, Tab, Shift-Tab, Delete, a
 * typed marker, the arrow keys, word deletion, the formatting shortcuts and
 * a paste do on every kind of line, under every kind of line, with the
 * caret at each place. The rules are read off the editor's own bindings and
 * compared with the table in `model/`, so a change of behaviour shows as a
 * changed row. `pnpm vitest run src/codemirror/lineKeys -u` rewrites the table
 * after a change that is meant.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { checkLineKeys, type LineKeyReport } from "./check";

let report: LineKeyReport;

beforeAll(async () => {
  report = await checkLineKeys();
}, 900_000);

describe("the line-key machine", () => {
  it("does what the table says", async () => {
    await expect(report.table).toMatchFileSnapshot("../../../model/line-keys.tsv");
  });

  it("is the machine the TLA+ model checks", async () => {
    await expect(report.tla).toMatchFileSnapshot("../../../model/LineKeysRules.tla");
  });

  it("leaves the caret only where the table has rules, apart from the known places", async () => {
    await expect(`${report.uncovered.join("\n")}\n`).toMatchFileSnapshot("../../../model/line-keys.uncovered.tsv");
  });

  it("holds every check on the table as a whole (`check.ts`)", () => {
    expect(report.failures).toEqual({});
  });
});
