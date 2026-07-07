/**
 * Shared Given/When/Then steps for the block-command feature files.
 *
 * The whole block-command surface has one regular shape — a document with a
 * caret (or selection) goes in, a command runs, a document with a caret comes
 * out — so these steps drive every scenario across the `.feature` files. They're
 * registered once as a shared pool via {@link defineBlockSteps}; each scenario
 * draws the steps it needs.
 *
 * Marker convention in the doc strings: `‸` marks the caret; a second `‸` turns
 * it into a selection spanning the two marks. (`|` would collide with table
 * syntax, so it's deliberately not used.)
 */

import { EditorSelection } from "@codemirror/state";
import { type EditorView } from "@codemirror/view";
import { defineSteps } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { blockCommands } from "../decorations/blockCommands";
import { indentListItem, outdentListItem } from "../decorations/listIndent";
import { makeEditor, text } from "../decorations/editorTestHarness";

const CARET = "‸";

/** Zero-width space the runner prefixes onto doc-string content lines to hide
 *  literal markdown from the cucumber parser; stripped back out here. */
export const ZWSP = String.fromCharCode(0x200b);

const COMMANDS: Record<string, (view: EditorView) => boolean> = {
  "toggle heading 1": blockCommands.toggleHeading1,
  "toggle heading 2": blockCommands.toggleHeading2,
  "toggle heading 3": blockCommands.toggleHeading3,
  "toggle a bullet list": blockCommands.toggleBulletList,
  "toggle an ordered list": blockCommands.toggleOrderedList,
  "toggle a task list": blockCommands.toggleTaskList,
  "toggle a blockquote": blockCommands.toggleBlockquote,
  "toggle a code block": blockCommands.toggleCodeBlock,
  "insert a table": blockCommands.insertTable,
  "indent the list item": indentListItem,
  "outdent the list item": outdentListItem,
};

// A Gherkin doc string reaches us with the runner's zero-width guards and the
// parser's own per-line trim; drop the guards and any trailing blank line so the
// literal markdown is what the scenario asserts against.
function cleanDoc(block: string): string {
  return block
    .split(ZWSP)
    .join("")
    .replace(/\n+$/, "");
}

// `‸` → caret; a second `‸` → a selection from the first mark to the second.
function parseMarked(marked: string): { doc: string; anchor: number; head: number } {
  const first = marked.indexOf(CARET);
  if (first < 0) return { doc: marked, anchor: 0, head: 0 };
  const afterFirst = marked.slice(0, first) + marked.slice(first + CARET.length);
  const second = afterFirst.indexOf(CARET);
  if (second < 0) return { doc: afterFirst, anchor: first, head: first };
  const doc = afterFirst.slice(0, second) + afterFirst.slice(second + CARET.length);
  return { doc, anchor: first, head: second };
}

// Re-insert the marker(s) at the current selection, so a `Then` doc string can
// assert the resulting caret/selection as readably as it set the starting one.
function renderMarked(view: EditorView): string {
  const { anchor, head } = view.state.selection.main;
  const body = text(view);
  if (anchor === head) return body.slice(0, head) + CARET + body.slice(head);
  const [from, to] = anchor < head ? [anchor, head] : [head, anchor];
  return body.slice(0, from) + CARET + body.slice(from, to) + CARET + body.slice(to);
}

// Register the shared step pool. Scenarios run sequentially within the file, so
// a single live editor is enough to thread Given → When → Then.
export function defineBlockSteps(): void {
  let view: EditorView;

  defineSteps(({ Given, When, Then, And }) => {
    Given("the document:", (_ctx: unknown, doc: string) => {
      const { doc: source, anchor, head } = parseMarked(cleanDoc(doc));
      view = makeEditor(source, head);
      if (anchor !== head) view.dispatch({ selection: EditorSelection.range(anchor, head) });
    });

    const run = (_ctx: unknown, phrase: string) => {
      const command = COMMANDS[phrase];
      if (!command) throw new Error(`no editor command bound for "${phrase}"`);
      command(view);
    };
    When("I {string}", run);
    And("I {string}", run);

    // A `Then` doc string opts into a caret assertion by including `‸`; without
    // one it asserts the document text alone.
    Then("the document is:", (_ctx: unknown, expected: string) => {
      const want = cleanDoc(expected);
      expect(want.includes(CARET) ? renderMarked(view) : text(view)).toBe(want);
    });
  });
}

// The cucumber parser treats a `#`-leading line as a comment and a `"""`/``` line
// as a doc-string delimiter — even *inside* a doc string — and it strips each
// content line's leading whitespace, which would also flatten the *relative*
// indent that list-nesting scenarios assert. So for every doc-string content
// line: strip the doc string's own base indent (the opening `"""` column), then
// prefix a zero-width space at column 0. The ZWSP is now the first character, so
// the parser strips nothing (relative indent survives) and reads no `#`/`"""`/```
// as syntax; the steps drop the ZWSP back out. Source `.feature` files stay clean.
export function protectMarkdown(raw: string): string {
  let insideDocString = false;
  let baseIndent = 0;
  return raw
    .split("\n")
    .map((line) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('"""')) {
        if (!insideDocString) baseIndent = line.length - trimmed.length;
        insideDocString = !insideDocString;
        return line;
      }
      if (!insideDocString) return line;
      const dedented = line.startsWith(" ".repeat(baseIndent))
        ? line.slice(baseIndent)
        : trimmed;
      return ZWSP + dedented;
    })
    .join("\n");
}
