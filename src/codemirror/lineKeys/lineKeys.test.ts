// @vitest-environment jsdom
/**
 * The line-key machine: what Backspace, Enter, Tab, Shift-Tab, Delete and a
 * typed marker do on every kind of line, under every kind of line, with the
 * caret at each place. The rules are read off the editor's own bindings and
 * compared with the table in `model/`, so a change of behaviour shows as a
 * changed row. `pnpm vitest run src/codemirror/lineKeys -u` rewrites the table
 * after a change that is meant.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { explore, outcomeOf, rules, stateOf, type Rule } from "./explore";
import { stuck, table, tlaRules, uncovered } from "./model";

let found: Rule[] = [];

beforeAll(async () => {
  found = rules(await explore());
}, 600_000);

describe("the line-key machine", () => {
  it("gives every state one outcome per key", () => {
    const split = found
      .filter((rule) => rule.conflicts.length > 0)
      .map((rule) => [rule, ...rule.conflicts].map((seen) => `${rule.key} in ${stateOf(rule)}: ${outcomeOf(seen)}  ${JSON.stringify(seen.before)} -> ${JSON.stringify(seen.after)}`));
    expect(split).toEqual([]);
  });

  it("does what the table says", async () => {
    await expect(table(found)).toMatchFileSnapshot("../../../model/line-keys.tsv");
  });

  it("is the machine the TLA+ model checks", async () => {
    await expect(tlaRules(found)).toMatchFileSnapshot("../../../model/LineKeysRules.tla");
  });

  it("leaves the caret only where the table has rules, apart from the known places", async () => {
    await expect(`${uncovered(found).join("\n")}\n`).toMatchFileSnapshot("../../../model/line-keys.uncovered.tsv");
  });

  it("makes progress on every Backspace, so holding it ends at the start of the document", () => {
    expect(stuck(found).map((rule) => `${stateOf(rule)}  ${JSON.stringify(rule.before)} -> ${JSON.stringify(rule.after)}`)).toEqual([]);
  });
});
