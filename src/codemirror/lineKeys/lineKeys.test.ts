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

import { marked, mount, press, unmount } from "./drive";
import { explore, KEYS, outcomeOf, rules, stateOf, type Rule } from "./explore";
import { stuck, table, textOf, tlaRules, uncovered } from "./model";

let found: Rule[] = [];

const shown = (rule: Rule, after = rule.after): string => `${rule.key} in ${stateOf(rule)}  ${JSON.stringify(rule.before)} -> ${JSON.stringify(after)}`;
const of = (...keys: string[]): Rule[] => found.filter((rule) => keys.includes(rule.key));

/** The document after `names` are pressed in turn, starting from `before`. */
function after(before: string, ...names: string[]): string {
  const view = mount(before);
  try {
    for (const name of names) {
      const chord = KEYS.find((key) => key.name === name)?.chord;
      if (chord) press(view, chord);
    }
    return marked(view);
  } finally {
    unmount(view);
  }
}

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

  it("moves the caret with an arrow key and edits nothing", () => {
    expect(of("ArrowLeft", "ArrowRight").filter((rule) => rule.outcome?.edited).map((rule) => shown(rule))).toEqual([]);
  });

  it("comes back to the same place when an arrow key is undone by the other and pressed again", () => {
    const back: Record<string, string> = { ArrowLeft: "ArrowRight", ArrowRight: "ArrowLeft" };
    // From a place the arrow keys themselves reach: the text of a line. A
    // rule line is drawn as one thing, and has no place inside it.
    const lost = of("ArrowLeft", "ArrowRight")
      .filter((rule) => rule.outcome && rule.line !== "rule" && ["start", "middle", "end", "blank"].includes(rule.at))
      .map((rule) => [rule, after(rule.before, rule.key, back[rule.key], rule.key)] as const)
      .filter(([rule, again]) => again !== rule.after);
    expect(lost.map(([rule, again]) => shown(rule, again))).toEqual([]);
  }, 120_000);

  it("takes text away with a word deletion, and adds none", () => {
    const grew = of("Word-Backspace", "Word-Delete").filter((rule) => textOf(rule.after).length > textOf(rule.before).length);
    expect(grew.map((rule) => shown(rule))).toEqual([]);
  });

  it("restores the text when bold, italic or code is pressed a second time", () => {
    // Where the first press put markers in. Inside a span it takes that
    // span's markers out, and a second press starts a new one at the caret.
    const changed = of("Bold", "Italic", "Code")
      .filter((rule) => textOf(rule.after).length > textOf(rule.before).length)
      .map((rule) => [rule, after(rule.before, rule.key, rule.key)] as const)
      .filter(([rule, twice]) => textOf(twice) !== textOf(rule.before));
    expect(changed.map(([rule, twice]) => shown(rule, twice))).toEqual([]);
  }, 120_000);

  it("keeps the fences of a code block, whatever is pressed inside it", () => {
    const fences = (doc: string): number => doc.split("\n").filter((line) => line.startsWith("```")).length;
    const broken = found
      .filter((rule) => rule.span && (rule.line === "code" || rule.line === "fence"))
      .filter((rule) => fences(textOf(rule.after)) !== 2 && !(rule.span === "in an empty code block" && fences(textOf(rule.after)) === 0));
    expect(broken.map((rule) => shown(rule))).toEqual([]);
  });

  it("leaves no empty pair of markers where styled text was deleted", () => {
    const emptyPair = /\*{4}|(?<![*\w])\*\*(?![*\w])|(?<![`\w])``(?![`\w])|\[\]\(/;
    const left = of("Backspace", "Delete", "Word-Backspace", "Word-Delete").filter((rule) => rule.span && emptyPair.test(textOf(rule.after)));
    expect(left.map((rule) => shown(rule))).toEqual([]);
  });
});
