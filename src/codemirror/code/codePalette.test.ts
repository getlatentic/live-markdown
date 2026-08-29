import { describe, expect, it } from "vitest";

import { CODE_PALETTE, themedColor } from "./codePalette";

/**
 * The palette feeds two renderers with opposite constraints: the editor emits a
 * stylesheet and can be themed, the clipboard emits inline styles and cannot.
 * These hold that split, because getting it backwards is invisible until
 * someone pastes code into a document and finds it black.
 */
describe("CODE_PALETTE", () => {
  it("gives the editor a themeable colour with the light value as fallback", () => {
    // A host that sets nothing must get exactly the palette it had before.
    for (const spec of CODE_PALETTE) {
      expect(themedColor(spec)).toBe(`var(${spec.cssVar}, ${spec.color})`);
    }
  });

  it("keeps a literal colour for the clipboard, never a var()", () => {
    // Pasted HTML carries no stylesheet: `var()` there resolves to nothing and
    // the code arrives colourless in Google Docs or Word.
    for (const spec of CODE_PALETTE) {
      expect(spec.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(spec.color).not.toContain("var(");
    }
  });

  it("names every role uniquely, so one can be restyled without the others", () => {
    const names = CODE_PALETTE.map((spec) => spec.cssVar);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^--md-code-[a-z]+$/);
    }
  });

  it("covers every entry — a spec with no variable is silently unthemeable", () => {
    for (const spec of CODE_PALETTE) {
      expect(spec.cssVar).toBeTruthy();
    }
  });
});
