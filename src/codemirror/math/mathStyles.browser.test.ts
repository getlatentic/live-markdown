/**
 * @browser: math is styled with no stylesheet imported by the host. Only a
 * browser applies one, so only here can a fraction be seen to stack.
 */
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeFullEditor } from "../core/editorTestHarness";
import { mathTypesettingSettled } from "./mathWidget";

afterEach(destroyEditors);

describe("math in a host that imports no KaTeX stylesheet", () => {
  it("is drawn with KaTeX's styles", async () => {
    const view = makeFullEditor("text\n\nhalf is $\\frac{1}{2}$ here", 0);
    document.body.appendChild(view.dom);
    await mathTypesettingSettled();
    const fraction = view.dom.querySelector(".katex .mfrac .frac-line");
    expect(fraction).not.toBeNull();
    // The bar of a fraction is a border KaTeX's stylesheet draws.
    await expect.poll(() => getComputedStyle(fraction as Element).borderBottomStyle).toBe("solid");
  });
});
