/**
 * @browser: a cell's mathematics is LAID OUT, not just present in the DOM.
 *
 * jsdom can report a `.katex` element and tell you nothing about whether it
 * occupies space — and a KaTeX fraction is exactly the case where the markup
 * can be right while the layout is empty, since its rule and numerator are
 * positioned by CSS the cell's sanitiser could have stripped.
 */

// KaTeX ships its own stylesheet; without it a fraction is in the DOM but does
// not stack, which is the very thing this tier exists to tell apart.
import "katex/dist/katex.min.css";
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeFullEditor } from "../core/editorTestHarness";

const FRACTION = "$440 = 2 \\times \\frac{22}{7} \\times r$";

function cellOf(source: string): HTMLElement {
  const doc = ["| h |", "| --- |", `| ${source} |`].join("\n");
  const td = makeFullEditor(doc, 0).contentDOM.querySelector("td");
  if (!td) throw new Error("no cell rendered");
  return td as HTMLElement;
}

describe("@browser table cell rendering", () => {
  afterEach(destroyEditors);

  it("lays out a fraction inside a cell", () => {
    const katex = cellOf(FRACTION).querySelector(".katex") as HTMLElement | null;
    expect(katex).not.toBeNull();
    const box = katex!.getBoundingClientRect();
    expect(box.width).toBeGreaterThan(0);
    // `\frac` really parsed — `$r$` has no `.mfrac` to find.
    expect(katex!.querySelector(".mfrac")).not.toBeNull();
    expect(cellOf("$r$").querySelector(".mfrac")).toBeNull();

    // …and its stylesheet survived the cell's sanitiser. Measured on the CELL:
    // `.katex` is an inline span, so its own rect is just the line box and
    // reads the same for a fraction as for a single letter. Unstyled KaTeX
    // renders SHORTER than prose (15px against 20px here), so a math cell that
    // is taller than a prose cell is the assertion that catches stripped CSS.
    const withMath = cellOf(FRACTION).getBoundingClientRect().height;
    expect(withMath).toBeGreaterThan(cellOf("plain").getBoundingClientRect().height);
  });

  it("keeps the source visible when the cell is plain prose", () => {
    expect(cellOf("just words").textContent).toBe("just words");
  });

  it("keeps every bracket of a LaTeX line in the body", () => {
    const line = "\\draw (0,0)++(0:0.7) arc[start angle=0, radius=0.7];";
    const view = makeFullEditor(line, 0);
    expect(view.contentDOM.textContent).toBe(line);
  });
});
