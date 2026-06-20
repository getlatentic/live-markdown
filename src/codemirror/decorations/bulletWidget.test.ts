// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { BulletWidget } from "./bulletWidget";
import { destroyEditors, makeEditor } from "./editorTestHarness";

describe("BulletWidget", () => {
  afterEach(destroyEditors);

  it("renders a • inside span.cm-bullet-widget", () => {
    const dom = new BulletWidget().toDOM(makeEditor("x", 0));
    expect(dom.tagName).toBe("SPAN");
    expect(dom.className).toBe("cm-bullet-widget");
    expect(dom.textContent).toBe("•");
  });

  it("eq() is always true (DOM reuse) and ignoreEvent() is false (clicks pass through)", () => {
    expect(new BulletWidget().eq(new BulletWidget())).toBe(true);
    expect(new BulletWidget().ignoreEvent()).toBe(false);
  });
});
