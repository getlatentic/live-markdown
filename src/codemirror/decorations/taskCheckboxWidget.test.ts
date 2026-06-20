// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor, text } from "./editorTestHarness";
import { TaskCheckboxWidget } from "./taskCheckboxWidget";

describe("TaskCheckboxWidget", () => {
  afterEach(destroyEditors);

  it("renders a checkbox reflecting the checked state", () => {
    const view = makeEditor("- [ ] task", 0);
    const dom = new TaskCheckboxWidget(false, 2).toDOM(view) as HTMLInputElement;
    expect(dom.tagName).toBe("INPUT");
    expect(dom.type).toBe("checkbox");
    expect(dom.checked).toBe(false);
    expect(new TaskCheckboxWidget(true, 2).toDOM(view).getAttribute("type")).toBe("checkbox");
  });

  it("toggles the source marker [ ] -> [x] on click", () => {
    const view = makeEditor("- [ ] task", 0);
    const dom = new TaskCheckboxWidget(false, 2).toDOM(view) as HTMLInputElement; // `[` at index 2
    dom.click();
    expect(text(view)).toBe("- [x] task");
  });

  it("toggles [x] -> [ ] on click", () => {
    const view = makeEditor("- [x] task", 0);
    const dom = new TaskCheckboxWidget(true, 2).toDOM(view) as HTMLInputElement;
    dom.click();
    expect(text(view)).toBe("- [ ] task");
  });
});
