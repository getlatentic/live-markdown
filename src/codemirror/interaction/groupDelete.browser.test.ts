/**
 * @browser: the word- and line-delete chords, pressed for real with
 * CodeMirror's own keymap installed beneath — the binding must win, or the
 * default command cuts hidden markers in half.
 */

import { defaultKeymap } from "@codemirror/commands";
import { keymap } from "@codemirror/view";
import { userEvent } from "@vitest/browser/context";
import { afterEach, describe, expect, it } from "vitest";

import { editorBaseTheme } from "../core";
import { destroyEditors, makeFullEditor, text } from "../core/editorTestHarness";
import { groupDeleteKeymap } from "./groupDelete";

afterEach(destroyEditors);

const mac = /Mac/.test(navigator.platform);
const WORD = mac ? "{Alt>}{Backspace}{/Alt}" : "{Control>}{Backspace}{/Control}";

function mount(doc: string, caret: number) {
  const view = makeFullEditor(doc, caret, [editorBaseTheme, groupDeleteKeymap, keymap.of(defaultKeymap)]);
  document.body.appendChild(view.dom);
  view.focus();
  return view;
}

describe("the word-delete chord", () => {
  it("takes a bold word whole instead of half its markers", async () => {
    const view = mount("**Compose** rocks", 11);
    await userEvent.keyboard(WORD);
    expect(text(view)).toBe(" rocks");
  });

  it.runIf(mac)("⌘⌫ clears a heading's text and keeps the heading", async () => {
    const view = mount("## Opening slide", 16);
    await userEvent.keyboard("{Meta>}{Backspace}{/Meta}");
    expect(text(view)).toBe("## ");
  });
});
