// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "./editorTestHarness";
import { MathWidget } from "./mathWidget";

describe("MathWidget", () => {
  afterEach(destroyEditors);

  it("renders inline math into a <span>.cm-math-inline", () => {
    const view = makeEditor("x", 0);
    const dom = new MathWidget("x^2", false).toDOM(view);
    expect(dom.tagName).toBe("SPAN");
    expect(dom.className).toBe("cm-math-inline");
  });

  it("renders block math into a <div>.cm-math-block", () => {
    const view = makeEditor("x", 0);
    const dom = new MathWidget("x^2", true).toDOM(view);
    expect(dom.tagName).toBe("DIV");
    expect(dom.className).toBe("cm-math-block");
  });

  it("eq() distinguishes tex and display mode", () => {
    expect(new MathWidget("a", false).eq(new MathWidget("a", false))).toBe(true);
    expect(new MathWidget("a", false).eq(new MathWidget("b", false))).toBe(false);
    expect(new MathWidget("a", false).eq(new MathWidget("a", true))).toBe(false);
  });
});
