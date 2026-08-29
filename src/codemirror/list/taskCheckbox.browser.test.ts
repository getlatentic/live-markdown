/**
 * @browser: the task checkbox's appearance, in a real engine, under both host
 * themes. Colour here is decided by CSS custom properties the HOST supplies, so
 * the only place the result is knowable is a browser with those properties set
 * and the styles actually cascaded.
 */

import { afterEach, describe, expect, it } from "vitest";

import { editorBaseTheme } from "../core";
import { destroyEditors, makeFullEditor } from "../core/editorTestHarness";

/** The token values a light and a dark host set (Carbon `white` and `g100`). */
const THEMES = {
  light: { "--cds-icon-primary": "#161616", "--cds-background": "#ffffff" },
  dark: { "--cds-icon-primary": "#f4f4f4", "--cds-background": "#161616" },
};

function applyTheme(theme: keyof typeof THEMES): void {
  for (const [name, value] of Object.entries(THEMES[theme])) {
    document.documentElement.style.setProperty(name, value);
  }
}

/** WCAG relative luminance, for a `rgb(r, g, b)` string. */
function luminance(color: string): number {
  const [r, g, b] = (color.match(/\d+(\.\d+)?/g) ?? ["0", "0", "0"]).slice(0, 3).map(Number);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function checkbox(doc: string): HTMLElement {
  const view = makeFullEditor(doc, 0, [editorBaseTheme]);
  document.body.appendChild(view.dom);
  const box = view.contentDOM.querySelector(".cm-task-checkbox");
  if (!(box instanceof HTMLElement)) throw new Error("no checkbox rendered");
  return box;
}

afterEach(() => {
  destroyEditors();
  for (const name of Object.keys({ ...THEMES.light, ...THEMES.dark })) {
    document.documentElement.style.removeProperty(name);
  }
});

describe("task checkbox", () => {
  it.each(["light", "dark"] as const)("shows its tick against the fill in %s", (theme) => {
    applyTheme(theme);
    const box = checkbox("- [x] done");
    const fill = getComputedStyle(box).backgroundColor;
    const tick = getComputedStyle(box, "::after").borderBottomColor;

    // CONTRAST, not inequality. The bug was `--cds-icon-on-color` for the tick —
    // white in every theme — against a fill of `--cds-icon-primary`, which
    // inverts. In dark that is #ffffff on #f4f4f4: different values, ratio 1.05,
    // invisible. A test for "not equal" would have passed it. 3:1 is the WCAG
    // floor for non-text graphics.
    expect(contrastRatio(tick, fill)).toBeGreaterThan(3);
  });

  it("is smaller than the text it sits beside", () => {
    applyTheme("light");
    const box = checkbox("- [ ] todo");
    const boxSize = box.getBoundingClientRect().height;
    const textSize = parseFloat(getComputedStyle(box.parentElement ?? box).fontSize);

    // A box as tall as the full em box towers over lowercase letters, whose cap
    // height is nearer 0.7em.
    expect(boxSize).toBeGreaterThan(0);
    expect(boxSize).toBeLessThan(textSize);
  });

  it("sits on the text's x-height, not hanging off the baseline", () => {
    applyTheme("light");
    const box = checkbox("- [ ] todo");
    const line = box.closest(".cm-line");
    if (!(line instanceof HTMLElement)) throw new Error("no line");

    const boxRect = box.getBoundingClientRect();
    const lineRect = line.getBoundingClientRect();
    // Its centre should land within the middle half of the line box — loose
    // enough to survive font metrics, tight enough to catch a box that has
    // slipped below the text or floated above it.
    const centre = (boxRect.top + boxRect.bottom) / 2 - lineRect.top;
    expect(centre).toBeGreaterThan(lineRect.height * 0.25);
    expect(centre).toBeLessThan(lineRect.height * 0.75);
  });
});
