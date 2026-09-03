/**
 * @browser: the caret's colour under both host themes.
 *
 * CodeMirror's base theme paints `.cm-cursor` `solid black` and swaps to a
 * lighter variant only when the view theme is registered `{ dark: true }`. This
 * editor is themed through CSS custom properties instead, so CodeMirror always
 * believes it is light. Nothing but a real engine, with the base theme actually
 * cascaded, can show what colour the caret ends up.
 */

import { EditorView, drawSelection } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { editorBaseTheme } from ".";
import { destroyEditors, makeFullEditor } from "./editorTestHarness";

const THEMES = {
  light: { "--cds-text-primary": "#161616", "--cds-background": "#ffffff" },
  dark: { "--cds-text-primary": "#f4f4f4", "--cds-background": "#161616" },
};

function applyTheme(theme: keyof typeof THEMES): void {
  for (const [name, value] of Object.entries(THEMES[theme])) {
    document.documentElement.style.setProperty(name, value);
  }
}

/**
 * Accepts BOTH `rgb(r, g, b)` (what `getComputedStyle` returns) and `#rrggbb`
 * (what the theme table holds). An rgb-only parser silently reads `#ffffff` as
 * black — no digits for it to match — and then reports white-on-white as a
 * contrast failure, which is a bug hunt for a bug that is not there.
 */
function rgb(color: string): [number, number, number] {
  const hex = color.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const parts = color.match(/\d+(\.\d+)?/g);
  if (!parts || parts.length < 3) {
    throw new Error(`cannot read a colour from "${color}"`);
  }
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}

function luminance(color: string): number {
  const [r, g, b] = rgb(color);
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

// `.cm-cursor` is drawn by `drawSelection`; without it CodeMirror uses the
// native caret and there is no element to inspect. The styling under test
// targets the class, whoever creates it.
async function caret(): Promise<HTMLElement> {
  const view: EditorView = makeFullEditor("hello", 3, [editorBaseTheme, drawSelection()]);
  document.body.appendChild(view.dom);
  view.focus();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const el = view.dom.querySelector(".cm-cursor");
  if (!(el instanceof HTMLElement)) throw new Error("no caret rendered");
  return el;
}

afterEach(() => {
  destroyEditors();
  for (const name of Object.keys({ ...THEMES.light, ...THEMES.dark })) {
    document.documentElement.style.removeProperty(name);
  }
});

describe("caret colour", () => {
  it.each(["light", "dark"] as const)("is visible against the canvas in %s", async (theme) => {
    applyTheme(theme);
    const el = await caret();
    const ink = getComputedStyle(el).borderLeftColor;
    const canvas = THEMES[theme]["--cds-background"];

    // A caret you cannot see is worse than most bugs: it is invisible exactly
    // where someone is typing. 3:1 is the WCAG floor for non-text graphics.
    expect(contrastRatio(ink, canvas)).toBeGreaterThan(3);
  });

  it("is not left at CodeMirror's hardcoded black", async () => {
    // The regression this pins. Without an explicit colour the base theme's
    // `solid black` wins, which reads fine in light and vanishes in dark.
    applyTheme("dark");
    expect(getComputedStyle(await caret()).borderLeftColor).not.toBe("rgb(0, 0, 0)");
  });
});
