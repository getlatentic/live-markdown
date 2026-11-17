/**
 * The drawn selection has to take the HOST's highlight token. It is the only
 * thing standing between selected text and its background, and the fallback in
 * the theme is a light blue — which on a dark host is light-on-light.
 */
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "./core/editorTestHarness";
import { editorBaseTheme } from "./core/editorTheme";
import { drawnSelection } from "./selectionLayer";

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
async function settle(): Promise<void> {
  await frame();
  await frame();
}

/** Compose's dark token. */
const DARK_HIGHLIGHT = "rgb(0, 29, 108)";

describe("@browser drawn selection colour", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty("--cds-highlight");
    destroyEditors();
  });

  it("paints the host's --cds-highlight, not the theme's light fallback", async () => {
    document.documentElement.style.setProperty("--cds-highlight", "#001d6c");
    const view = makeEditor("alpha beta\ngamma delta\nepsilon zeta\n", 0, [
      editorBaseTheme,
      drawnSelection,
    ]);
    await settle();
    view.focus();
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    await settle();

    const bands = Array.from(
      view.dom.querySelectorAll<HTMLElement>(".cm-selectionLayer .cm-selectionBackground"),
    );
    expect(bands.length).toBeGreaterThan(0);
    const painted = bands.map((el) => getComputedStyle(el).backgroundColor);
    // Every band, not just the first — the layer paints first/last rows
    // separately from the full-width middle, and they must agree.
    expect(new Set(painted)).toEqual(new Set([DARK_HIGHLIGHT]));
  });
});
