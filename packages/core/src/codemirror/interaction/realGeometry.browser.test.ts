/**
 * Real-WebKit smoke for the browser test tier (ADR 0001 §Testing).
 *
 * Each case is a primitive the redesign's @browser scenarios depend on and
 * that jsdom silently passes without testing (no layout engine):
 *   1. editor geometry (coordsAtPos) is real,
 *   2. click-mapping (posAtCoords) round-trips,
 *   3. `contenteditable="plaintext-only"` accepts focus and REAL key input.
 */

import { userEvent } from "@vitest/browser/context";
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "../core/editorTestHarness";

describe("real WebKit geometry smoke", () => {
  afterEach(destroyEditors);

  it("coordsAtPos returns a real caret rect", () => {
    const view = makeEditor("hello world", 3);
    const rect = view.coordsAtPos(3);
    expect(rect).not.toBeNull();
    expect(rect!.bottom).toBeGreaterThan(rect!.top);
  });

  it("posAtCoords round-trips a character position (click mapping)", () => {
    const view = makeEditor("hello world", 0);
    const c = view.coordsAtPos(6)!;
    const pos = view.posAtCoords({ x: c.left + 1, y: (c.top + c.bottom) / 2 });
    expect(pos).toBe(6);
  });
});

describe("plaintext-only cell smoke (surface-B primitive)", () => {
  afterEach(() => {
    document.querySelectorAll("table[data-smoke]").forEach((t) => t.remove());
  });

  function makeCell(): HTMLTableCellElement {
    const table = document.createElement("table");
    table.dataset.smoke = "1";
    const td = table.insertRow().insertCell();
    td.setAttribute("contenteditable", "plaintext-only");
    document.body.appendChild(table);
    return td;
  }

  it("the engine supports plaintext-only and focuses the cell", () => {
    const td = makeCell();
    expect(td.contentEditable).toBe("plaintext-only");
    expect(td.isContentEditable).toBe(true);
    td.focus();
    expect(document.activeElement).toBe(td);
  });

  it("real keyboard input lands in the cell as plain text", async () => {
    const td = makeCell();
    await userEvent.click(td);
    await userEvent.keyboard("hi | there");
    expect(td.textContent).toBe("hi | there");
    expect(td.innerHTML).not.toContain("<");
  });

  it("a click and the selection stay inside the cell", async () => {
    const td = makeCell();
    td.textContent = "content";
    await userEvent.click(td);
    const sel = document.getSelection();
    expect(sel?.anchorNode && td.contains(sel.anchorNode)).toBe(true);
  });
});
