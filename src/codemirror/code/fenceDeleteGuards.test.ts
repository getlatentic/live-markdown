// @vitest-environment jsdom
// interaction-spec §12.1–.3 — fence lines are structure, not text.
import { afterEach, describe, expect, it } from "vitest";

import { visibleBackspace, visibleDeleteForward } from "../interaction/deleteNormalizer";
import { destroyEditors, makeEditor, text } from "../core/editorTestHarness";

describe("fence delete walls (§12.1)", () => {
  afterEach(destroyEditors);

  it("backspace at the first content line start is a no-op", () => {
    const doc = "above\n```\ncode\n```";
    const view = makeEditor(doc, doc.indexOf("code"));
    expect(visibleBackspace(view)).toBe(true);
    expect(text(view)).toBe(doc);
  });

  it("forward-delete at the last content line end is a no-op", () => {
    const doc = "```\ncode\n```\nafter";
    const view = makeEditor(doc, doc.indexOf("code") + 4);
    expect(visibleDeleteForward(view)).toBe(true);
    expect(text(view)).toBe(doc);
  });

  it("interior code lines join plainly — no list-prefix eating", () => {
    // "- looks like a bullet" inside code is code; the join must remove just
    // the newline, never a pseudo list marker.
    const doc = "```\nfirst\n- second\n```";
    const view = makeEditor(doc, doc.indexOf("- second"));
    visibleBackspace(view);
    expect(text(view)).toBe("```\nfirst- second\n```");
  });

  it("backspacing into an effectively empty block deletes it whole", () => {
    const doc = "above\n```\n\n```";
    const view = makeEditor(doc, doc.indexOf("\n\n```") + 1); // caret on the empty content line
    visibleBackspace(view);
    // A trailing block takes its preceding newline with it — no dangling
    // empty line; the caret rests at the end of the text above.
    expect(text(view)).toBe("above");
    expect(view.state.selection.main.head).toBe("above".length);
  });
});

describe("fence two-step approach (§12.2)", () => {
  afterEach(destroyEditors);

  it("backspace after the block parks at the content end, no edit", () => {
    const doc = "```\ncode\n```\nafter";
    const view = makeEditor(doc, doc.indexOf("after"));
    expect(visibleBackspace(view)).toBe(true);
    expect(text(view)).toBe(doc);
    expect(view.state.selection.main.head).toBe(doc.indexOf("code") + 4);
  });

  it("a second backspace (now inside) deletes code, not the fence", () => {
    const doc = "```\ncode\n```\nafter";
    const view = makeEditor(doc, doc.indexOf("after"));
    visibleBackspace(view); // park
    visibleBackspace(view); // delete 'e'
    expect(text(view)).toBe("```\ncod\n```\nafter");
  });

  it("forward-delete before the block parks at the content start", () => {
    const doc = "before\n```\ncode\n```";
    const view = makeEditor(doc, "before".length);
    expect(visibleDeleteForward(view)).toBe(true);
    expect(text(view)).toBe(doc);
    expect(view.state.selection.main.head).toBe(doc.indexOf("code"));
  });

  it("an empty block approached from below is deleted whole", () => {
    const doc = "```\n\n```\nafter";
    const view = makeEditor(doc, doc.indexOf("after"));
    visibleBackspace(view);
    expect(text(view)).toBe("after");
  });
});

describe("fence line above (§12.3)", () => {
  afterEach(destroyEditors);

  it("backspace on an empty line above a block removes that line", () => {
    const doc = "above\n\n```\ncode\n```";
    const view = makeEditor(doc, doc.indexOf("\n```"));
    visibleBackspace(view);
    expect(text(view)).toBe("above\n```\ncode\n```");
  });
});
