/**
 * @browser: the line-key table replayed with real key presses. The table is
 * read off the editor by calling its bindings; a browser delivers keys and
 * typed text by its own path (keydown, beforeinput, a changed DOM). Each row
 * is pressed here for real, and must give the document the table records.
 * A paste is a paste event that carries the text: the system clipboard is
 * left alone.
 */

import type { EditorView } from "@codemirror/view";
import { userEvent } from "@vitest/browser/context";
import { describe, expect, it } from "vitest";

import table from "../../../model/line-keys.tsv?raw";
import { held, marked, mount, paste, unmount, type Chord } from "./drive";
import { KEYS } from "./explore";

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

const BY_NAME = new Map(KEYS.map((key) => [key.name, key]));

/** A chord in the syntax the browser driver presses: `{Shift>}{Tab}{/Shift}`. */
function pressed(chord: Chord): string {
  const { shiftKey, altKey, metaKey, ctrlKey } = held(chord);
  const names = [shiftKey && "Shift", altKey && "Alt", metaKey && "Meta", ctrlKey && "Control"].filter((name): name is string => Boolean(name));
  const key = chord.key.length === 1 ? chord.key : `{${chord.key}}`;
  return names.map((name) => `{${name}>}`).join("") + key + names.reverse().map((name) => `{/${name}}`).join("");
}

/** The text of a `type "…"` row, as keys. `[` and `{` open a key name in
 *  this syntax, and are doubled to mean themselves. */
function typedKeys(name: string): string {
  const text = JSON.parse(name.slice("type ".length)) as string;
  return text.replace(/[[{]/g, "$&$&");
}

async function send(view: EditorView, row: Row): Promise<void> {
  const key = BY_NAME.get(row.key);
  if (key?.pasted !== undefined) return paste(view, key.pasted);
  await userEvent.keyboard(key?.chord ? pressed(key.chord) : typedKeys(row.key));
  // A pressed key is handled as it is pressed. Typed text reaches the editor
  // through its DOM observer, a moment later.
  for (let waited = 0; !key?.chord && marked(view) !== row.after && waited < 300; waited += 10) {
    await new Promise((resume) => setTimeout(resume, 10));
  }
}

async function result(row: Row): Promise<string> {
  const view: EditorView = mount(row.before);
  try {
    view.focus();
    await send(view, row);
    return marked(view);
  } finally {
    unmount(view);
  }
}

const NAMES = [...new Set(ROWS.map((row) => row.key))];

describe.each(NAMES)("the table's rows for %s, pressed for real", (key) => {
  it("give the documents the table records", async () => {
    const wrong: string[] = [];
    for (const row of ROWS.filter((each) => each.key === key)) {
      const got = await result(row);
      if (got !== row.after) wrong.push(`${row.state}  ${JSON.stringify(row.before)} -> ${JSON.stringify(got)}, table says ${JSON.stringify(row.after)}`);
    }
    expect(wrong.join("\n")).toBe("");
  }, 900_000);
});
