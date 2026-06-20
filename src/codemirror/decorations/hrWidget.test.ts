// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "./editorTestHarness";
import { HorizontalRuleWidget } from "./hrWidget";

describe("HorizontalRuleWidget", () => {
  afterEach(destroyEditors);

  it("renders span.cm-hr-widget", () => {
    const dom = new HorizontalRuleWidget().toDOM(makeEditor("x", 0));
    expect(dom.tagName).toBe("SPAN");
    expect(dom.className).toBe("cm-hr-widget");
  });

  it("eq() is always true and ignoreEvent() is false", () => {
    expect(new HorizontalRuleWidget().eq(new HorizontalRuleWidget())).toBe(true);
    expect(new HorizontalRuleWidget().ignoreEvent()).toBe(false);
  });
});
