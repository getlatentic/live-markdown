// @vitest-environment jsdom
import { EditorSelection } from "@codemirror/state";
import type { Command } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor, text } from "../core/editorTestHarness";
import { deleteLineBackward, deleteLineForward, deleteWordBackward, deleteWordForward } from "./groupDelete";

afterEach(destroyEditors);

/** `doc` after `run` with the caret at `caret`. */
function after(run: Command, doc: string, caret: number): string {
  const view = makeEditor(doc, caret);
  run(view);
  return text(view);
}

describe("deleting a word backward", () => {
  it("takes the word and leaves the formatting around what remains", () => {
    expect(after(deleteWordBackward, "**Compose rocks**", 15)).toBe("**Compose **");
  });

  it("takes a bold word whole, markers and all, from outside its closing marker", () => {
    expect(after(deleteWordBackward, "**Compose** rocks", 11)).toBe(" rocks");
  });

  it("leaves no empty markers behind when the word was all the span held", () => {
    expect(after(deleteWordBackward, "**Compose**", 9)).toBe("");
  });

  it("takes a link's last word and keeps the link", () => {
    expect(after(deleteWordBackward, "see [the docs](https://x.y)", 27)).toBe("see [the ](https://x.y)");
  });

  it("takes a one-word link whole", () => {
    expect(after(deleteWordBackward, "see [docs](https://x.y)", 23)).toBe("see ");
  });

  it("takes a word that runs across a formatting boundary", () => {
    expect(after(deleteWordBackward, "a **foo**bar", 12)).toBe("a ");
  });

  it("skips the spaces before the caret, then takes one word", () => {
    expect(after(deleteWordBackward, "one two   ", 10)).toBe("one ");
  });

  it("stops at punctuation, as a word motion does", () => {
    expect(after(deleteWordBackward, "wait... what", 12)).toBe("wait... ");
    expect(after(deleteWordBackward, "wait...", 7)).toBe("wait");
  });

  it("stops at a heading's or a bullet's marker", () => {
    expect(after(deleteWordBackward, "## Title", 8)).toBe("## ");
    expect(after(deleteWordBackward, "- milk", 6)).toBe("- ");
  });

  it("at the start of a line's text does what Backspace does there", () => {
    expect(after(deleteWordBackward, "one\ntwo", 4)).toBe("onetwo");
    expect(after(deleteWordBackward, "- milk", 2)).toBe("milk");
  });

  it("deletes a selection, as Backspace does", () => {
    const view = makeEditor("one two three", 0);
    view.dispatch({ selection: EditorSelection.range(4, 8) });
    deleteWordBackward(view);
    expect(text(view)).toBe("one three");
  });
});

describe("deleting a word forward", () => {
  it("takes a bold word whole from before its opening marker", () => {
    expect(after(deleteWordForward, "x **bold** y", 2)).toBe("x  y");
  });

  it("takes the next word inside formatting and keeps the rest formatted", () => {
    expect(after(deleteWordForward, "**one two**", 2)).toBe("** two**");
  });

  it("at the end of a line joins the next, as Delete does", () => {
    expect(after(deleteWordForward, "one\ntwo", 3)).toBe("onetwo");
  });
});

describe("deleting to the start of the line", () => {
  it("keeps the heading and the bullet", () => {
    expect(after(deleteLineBackward, "## Opening slide", 16)).toBe("## ");
    expect(after(deleteLineBackward, "- buy milk", 10)).toBe("- ");
    expect(after(deleteLineBackward, "- [ ] buy milk", 14)).toBe("- [ ] ");
  });

  it("keeps the formatting of what remains after the caret", () => {
    expect(after(deleteLineBackward, "say **bold text** now", 11)).toBe("**text** now");
  });

  it("stays on its own line", () => {
    expect(after(deleteLineBackward, "one\ntwo three", 7)).toBe("one\n three");
  });

  it("at the start of a line's text does what Backspace does there", () => {
    expect(after(deleteLineBackward, "one\ntwo", 4)).toBe("onetwo");
  });
});

describe("deleting to the end of the line", () => {
  it("takes the rest of the line's text and keeps what came before formatted", () => {
    expect(after(deleteLineForward, "say **bold text** now", 10)).toBe("say **bold**");
    expect(after(deleteLineForward, "## Opening slide", 3)).toBe("## ");
  });

  it("at the end of a line joins the next, as Delete does", () => {
    expect(after(deleteLineForward, "one\ntwo", 3)).toBe("onetwo");
  });
});
