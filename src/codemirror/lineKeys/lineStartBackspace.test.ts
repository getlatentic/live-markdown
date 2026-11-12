// @vitest-environment jsdom
// interaction-spec §8.2c–§8.2d — Backspace at the start of a heading or a list
// item, where the line stays part of what is above it.
import { afterEach, describe, expect, it } from "vitest";

import { visibleBackspace } from "../interaction/deleteNormalizer";
import { caret, destroyEditors, makeEditor, text } from "../core/editorTestHarness";
import { armedTableField } from "../table/tableArmed";
import { tableField } from "../table/tableField";

/** Press Backspace once per expected document, checking each in turn. */
function presses(doc: string, at: string, ...expected: string[]): ReturnType<typeof makeEditor> {
  const view = makeEditor(doc, doc.lastIndexOf(at));
  for (const next of expected) {
    visibleBackspace(view);
    expect(text(view)).toBe(next);
  }
  return view;
}

describe("a list item's marker becomes indentation inside the list (§8.2d)", () => {
  afterEach(destroyEditors);

  it("bullet: the marker, then the indentation, then the join", () => {
    presses("- one\n- two", "two", "- one\n  two", "- one\ntwo", "- onetwo");
  });

  it("leaves the caret in front of the text after each press", () => {
    const doc = "- one\n- two";
    const view = makeEditor(doc, doc.indexOf("two"));
    visibleBackspace(view);
    expect(caret(view)).toBe("- one\n  ".length);
    visibleBackspace(view);
    expect(caret(view)).toBe("- one\n".length);
  });

  it("number: the indentation is as wide as the number was", () => {
    presses("10. one\n11. two", "two", "10. one\n    two", "10. one\ntwo");
  });

  it("task: the text lines up under the checkbox", () => {
    presses("- [ ] one\n- [x] two", "two", "- [ ] one\n  two", "- [ ] one\ntwo");
  });

  it("an item after an empty line stays in the item above as its own paragraph", () => {
    presses("- one\n\n- two", "two", "- one\n\n  two", "- one\n\ntwo");
  });

  it("the items below keep their markers", () => {
    presses("1. one\n2. two\n3. three", "two", "1. one\n   two\n3. three");
  });

  it("the first item of a list has no item to stay in: the marker goes", () => {
    presses("- one\n- two", "one", "one\n- two");
    presses("para\n\n- one", "one", "para\n\none");
  });

  it("never leaves text indented far enough to read as code", () => {
    presses("- one\n\n100000. two", "two", "- one\n\ntwo");
  });

  it("a caret inside the indentation takes all of it", () => {
    const doc = "- one\n    two";
    const view = makeEditor(doc, doc.indexOf("two") - 2);
    visibleBackspace(view);
    expect(text(view)).toBe("- one\ntwo");
  });

  it("indentation outside a list is plain spaces, taken one at a time", () => {
    presses("para\n  two", "two", "para\n two");
  });

  it("code inside an item keeps its indentation", () => {
    const doc = "- one\n\n      code";
    presses(doc, "code", "- one\n\n     code");
  });
});

describe("a heading below text joins it in one press (§8.2c)", () => {
  afterEach(destroyEditors);

  it("takes the style of the line it joins", () => {
    presses("- item\n## Opening", "Opening", "- itemOpening");
    presses("# Title\n## Opening", "Opening", "# TitleOpening");
  });

  it("keeps bold at its start whole", () => {
    presses("Intro\n## **Opening** slide", "Opening", "Intro**Opening** slide");
  });

  it("inside a quote, joins the quoted line above", () => {
    presses("> Intro\n> ## Opening", "Opening", "> IntroOpening");
  });

  it("on the first line, turns into plain text", () => {
    presses("## Opening", "Opening", "Opening");
  });

  it("below a code block, moves the caret into the block and changes nothing", () => {
    const doc = "```\ncode\n```\n## Opening";
    const view = presses(doc, "Opening", doc);
    expect(caret(view)).toBe(doc.indexOf("code") + "code".length);
  });

  it("below a table, puts the caret at the table's end and changes nothing", () => {
    const table = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const doc = `${table}\n## Opening`;
    const view = makeEditor(doc, doc.indexOf("Opening"), [tableField, armedTableField]);
    visibleBackspace(view);
    expect(text(view)).toBe(doc);
    expect(caret(view)).toBe(table.length);
  });
});
