// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { BulletWidget, OrderedMarkerWidget } from "./bulletWidget";
import { destroyEditors, makeEditor } from "../core/editorTestHarness";

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

describe("OrderedMarkerWidget", () => {
  afterEach(destroyEditors);

  it("renders the marker number, not a bullet (so numbered lists stay numbered)", () => {
    const dom = new OrderedMarkerWidget("1.").toDOM(makeEditor("x", 0));
    expect(dom.tagName).toBe("SPAN");
    expect(dom.className).toContain("cm-ordered-marker");
    expect(dom.textContent).toBe("1.");
  });

  it("eq() compares the number so renumbering rebuilds the DOM", () => {
    expect(new OrderedMarkerWidget("1.").eq(new OrderedMarkerWidget("1."))).toBe(true);
    expect(new OrderedMarkerWidget("1.").eq(new OrderedMarkerWidget("2."))).toBe(false);
  });
});
