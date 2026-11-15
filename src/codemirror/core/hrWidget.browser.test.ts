/**
 * @browser: typing next to a rule's characters. A browser types where it
 * draws the caret, so these need one that draws.
 */

import { userEvent } from "@vitest/browser/context";
import { afterEach, describe, expect, it } from "vitest";

import { CARET, marked, mount, unmount } from "../lineKeys/drive";

const MOD = /Mac/.test(navigator.platform) ? "Meta" : "Control";

describe("typing where a rule's source has the caret", () => {
  let view: ReturnType<typeof mount> | null = null;
  afterEach(() => {
    if (view) unmount(view);
    view = null;
  });

  async function typed(doc: string, keys: string): Promise<string> {
    view = mount(doc);
    view.focus();
    await userEvent.keyboard(keys);
    return marked(view);
  }

  it("puts text typed after bold on an empty line inside the bold", async () => {
    expect(await typed(`text\n\n${CARET}`, `{${MOD}>}b{/${MOD}}word`)).toBe(`text\n\n**word${CARET}**`);
  });

  it("puts text typed after a dash in front of a rule after the dash", async () => {
    expect(await typed(`text\n\n${CARET}---`, "-x")).toBe(`text\n\n-x${CARET}---`);
  });
});
