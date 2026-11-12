/**
 * @browser: ArrowUp and ArrowDown. Which line they reach depends on where the
 * text is drawn, so they are not rows of the table: jsdom draws nothing. This
 * presses them for real in every state the table has for ArrowLeft, and
 * checks what must hold wherever the caret lands.
 */

import type { EditorView } from "@codemirror/view";
import { userEvent } from "@vitest/browser/context";
import { describe, expect, it } from "vitest";

import table from "../../../model/line-keys.tsv?raw";
import { CARET, marked, mount, unmount } from "./drive";

/** Documents with the caret in a line's text, and a line below it. */
const STARTS = table
  .split("\n")
  .map((row) => row.split("\t"))
  .filter(([key, state]) => key === "ArrowLeft" && /@(start|middle|end)( |$)/.test(state))
  .map(([, , , before]) => JSON.parse(before) as string)
  .filter((before) => before.indexOf("\n", before.indexOf(CARET)) >= 0);

const textOf = (doc: string): string => doc.replace(CARET, "");
const lineOf = (doc: string): number => doc.slice(0, doc.indexOf(CARET)).split("\n").length;

async function pressed(before: string, ...keys: string[]): Promise<string[]> {
  const view: EditorView = mount(before);
  try {
    view.focus();
    const seen: string[] = [];
    for (const key of keys) {
      await userEvent.keyboard(key);
      seen.push(marked(view));
    }
    return seen;
  } finally {
    unmount(view);
  }
}

describe("ArrowDown and ArrowUp, pressed for real", () => {
  it("move the caret to another line and edit nothing", async () => {
    expect(STARTS.length).toBeGreaterThan(100);
    const wrong: string[] = [];
    for (const before of STARTS) {
      const [down, up] = await pressed(before, "{ArrowDown}", "{ArrowUp}");
      if (textOf(down) !== textOf(before) || textOf(up) !== textOf(before)) wrong.push(`edited  ${JSON.stringify(before)} -> ${JSON.stringify(up)}`);
      else if (lineOf(down) <= lineOf(before)) wrong.push(`did not go down  ${JSON.stringify(before)} -> ${JSON.stringify(down)}`);
      else if (lineOf(up) >= lineOf(down)) wrong.push(`did not come back up  ${JSON.stringify(down)} -> ${JSON.stringify(up)}`);
    }
    expect(wrong.join("\n")).toBe("");
  }, 600_000);
});
