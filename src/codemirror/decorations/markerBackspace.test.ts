// @vitest-environment jsdom
// interaction-spec §8.2a — backspace at an item's content start un-marks the
// line in ONE press; joining up is the next press. Never nibbles hidden
// marker characters (the checkbox space/bracket bug).
import { afterEach, describe, expect, it } from "vitest";

import { visibleBackspace } from "./deleteNormalizer";
import { destroyEditors, makeEditor, text } from "./editorTestHarness";

describe("backspace at content start un-marks the line (§8.2a)", () => {
  afterEach(destroyEditors);

  it("task on the first line: one press removes the whole checkbox marker", () => {
    const doc = "- [ ] word";
    const view = makeEditor(doc, doc.indexOf("word"));
    visibleBackspace(view);
    expect(text(view)).toBe("word");
  });

  it("task below a paragraph: press 1 un-marks, press 2 joins", () => {
    const doc = "para\n- [ ] word";
    const view = makeEditor(doc, doc.indexOf("word"));
    visibleBackspace(view);
    expect(text(view)).toBe("para\nword");
    visibleBackspace(view);
    expect(text(view)).toBe("paraword");
  });

  it("bullet below a paragraph: press 1 un-marks, press 2 joins", () => {
    const doc = "para\n- word";
    const view = makeEditor(doc, doc.indexOf("word"));
    visibleBackspace(view);
    expect(text(view)).toBe("para\nword");
    visibleBackspace(view);
    expect(text(view)).toBe("paraword");
  });

  it("nested bullet keeps its indentation when un-marked", () => {
    const doc = "- outer\n  - inner";
    const view = makeEditor(doc, doc.indexOf("inner"));
    visibleBackspace(view);
    expect(text(view)).toBe("- outer\n  inner");
  });

  it("heading: one press strips the hashes", () => {
    const doc = "## Title";
    const view = makeEditor(doc, doc.indexOf("Title"));
    visibleBackspace(view);
    expect(text(view)).toBe("Title");
  });

  it("checked task un-marks the same way", () => {
    const doc = "- [x] done";
    const view = makeEditor(doc, doc.indexOf("done"));
    visibleBackspace(view);
    expect(text(view)).toBe("done");
  });

  it("mid-content backspace is untouched by the rule", () => {
    const doc = "- [ ] word";
    const view = makeEditor(doc, doc.length);
    visibleBackspace(view);
    expect(text(view)).toBe("- [ ] wor");
  });
});
