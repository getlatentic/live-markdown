/**
 * @browser: the line-key table replayed with real key presses. The table is
 * read off the editor by calling its bindings; a browser delivers keys and
 * typed text by its own path (keydown, beforeinput, a changed DOM). Each row
 * is pressed here for real, and must give the document the table records.
 */

import type { EditorView } from "@codemirror/view";
import { userEvent } from "@vitest/browser/context";
import { describe, expect, it } from "vitest";

import table from "../../../model/line-keys.tsv?raw";
import { marked, mount, unmount } from "./drive";

interface Row {
  key: string;
  state: string;
  before: string;
  after: string;
}

const ROWS: Row[] = table
  .split("\n")
  .slice(1)
  .filter((line) => line !== "")
  .map((line) => {
    const [key, state, , before, after] = line.split("\t");
    return { key, state, before: JSON.parse(before) as string, after: JSON.parse(after) as string };
  });

const PRESS: Record<string, string> = {
  Backspace: "{Backspace}",
  Delete: "{Delete}",
  Enter: "{Enter}",
  Tab: "{Tab}",
  "Shift-Tab": "{Shift>}{Tab}{/Shift}",
};

/** The keys to send: a named key, or the text of a `type "…"` row. `[` and
 *  `{` open a key name in this syntax, and are doubled to mean themselves. */
function keys(key: string): string {
  if (PRESS[key]) return PRESS[key];
  const text = JSON.parse(key.slice("type ".length)) as string;
  return text.replace(/[[{]/g, "$&$&");
}

async function result(row: Row): Promise<string> {
  const view: EditorView = mount(row.before);
  try {
    view.focus();
    await userEvent.keyboard(keys(row.key));
    // A named key is handled as it is pressed. Typed text reaches the editor
    // through its DOM observer, a moment later.
    for (let waited = 0; !PRESS[row.key] && marked(view) !== row.after && waited < 300; waited += 10) {
      await new Promise((resume) => setTimeout(resume, 10));
    }
    return marked(view);
  } finally {
    unmount(view);
  }
}

const KEYS = [...new Set(ROWS.map((row) => row.key))];

describe.each(KEYS)("the table's rows for %s, pressed for real", (key) => {
  it("give the documents the table records", async () => {
    const wrong: string[] = [];
    for (const row of ROWS.filter((each) => each.key === key)) {
      const got = await result(row);
      if (got !== row.after) wrong.push(`${row.state}  ${JSON.stringify(row.before)} -> ${JSON.stringify(got)}, table says ${JSON.stringify(row.after)}`);
    }
    expect(wrong).toEqual([]);
  }, 900_000);
});
