/**
 * @browser: ArrowUp and ArrowDown. Which line they reach depends on where the
 * text is drawn, and jsdom draws nothing, so their table is made here, in
 * WebKit: each key pressed for real in every state `line-keys.tsv` has for
 * ArrowLeft, and the line it lands on recorded in `vertical-keys.tsv`.
 */

import type { EditorView } from "@codemirror/view";
import { userEvent } from "@vitest/browser/context";
import { beforeAll, describe, expect, it } from "vitest";

import table from "../../../model/line-keys.tsv?raw";
import { CARET, marked, mount, unmount } from "./drive";
import { kindOfLine } from "./lineKind";

interface Start {
  state: string;
  before: string;
}

/** The states with the caret in a line's text, each with its document. */
const STARTS: Start[] = table
  .split("\n")
  .map((row) => row.split("\t"))
  .filter(([key, state]) => key === "ArrowLeft" && /@(start|middle|end)( |$)/.test(state))
  .map(([, state, , before]) => ({ state, before: JSON.parse(before) as string }));

interface Step extends Start {
  key: string;
  after: string;
  /** Lines moved, and the kind of the line reached. */
  outcome: string;
}

const lineOf = (doc: string): number => doc.slice(0, doc.indexOf(CARET)).split("\n").length;

async function step({ state, before }: Start, key: string): Promise<Step> {
  const view: EditorView = mount(before);
  try {
    view.focus();
    await userEvent.keyboard(`{${key}}`);
    const after = marked(view);
    const moved = lineOf(after) - lineOf(before);
    const reached = kindOfLine(view.state, view.state.doc.lineAt(view.state.selection.main.head).number);
    // Next to a table the key puts the caret in one of its cells: the
    // editor's own caret stays, and the cell has the focus.
    const inCell = view.dom.ownerDocument.activeElement !== view.contentDOM;
    const stayed = inCell ? "into the table" : "stays on its line";
    return { key, state, before, after, outcome: moved === 0 ? stayed : `${Math.abs(moved)} ${moved < 0 ? "up" : "down"}, to ${reached}` };
  } finally {
    unmount(view);
  }
}

const KEYS = ["ArrowDown", "ArrowUp"];
const steps: Step[] = [];

beforeAll(async () => {
  for (const key of KEYS) for (const start of STARTS) steps.push(await step(start, key));
}, 600_000);

const shown = (each: Step): string => `${each.key} in ${each.state}: ${each.outcome}  ${JSON.stringify(each.before)} -> ${JSON.stringify(each.after)}`;

describe("ArrowDown and ArrowUp, pressed for real", () => {
  it("are pressed in every state of the table", () => {
    expect(steps.length).toBeGreaterThan(2000);
  });

  it("edit nothing", () => {
    const text = (doc: string): string => doc.replace(CARET, "");
    expect(steps.filter((each) => text(each.after) !== text(each.before)).map(shown).join("\n")).toBe("");
  });

  it("go to another line wherever there is one that way", () => {
    const lines = (doc: string): number => doc.split("\n").length;
    const room = (each: Step): boolean => (each.key === "ArrowDown" ? lineOf(each.before) < lines(each.before) : lineOf(each.before) > 1);
    expect(steps.filter((each) => room(each) && each.outcome === "stays on its line").map(shown).join("\n")).toBe("");
  });

  it("do what the table says", async () => {
    const rows = steps.map((each) => [each.key, each.state, each.outcome, JSON.stringify(each.before), JSON.stringify(each.after)].join("\t"));
    await expect(`${["key", "state", "outcome", "before", "after"].join("\t")}\n${rows.sort().join("\n")}\n`).toMatchFileSnapshot("../../../model/vertical-keys.tsv");
  });
});
