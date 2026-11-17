// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { inCode, viewportTree } from "./codeContext";
import { destroyEditors, makeEditor } from "./editorTestHarness";

describe("inCode — grammar-level code-context test", () => {
  afterEach(destroyEditors);

  it("reports fenced, indented, and inline-code positions as code; prose as not", () => {
    const doc = "prose start\n\n```js\nlet x = 1\n```\n\n    indented\n\nmix `span` end";
    const view = makeEditor(doc);
    const tree = viewportTree(view);
    expect(inCode(tree, doc.indexOf("prose"))).toBe(false);
    expect(inCode(tree, doc.indexOf("let"))).toBe(true);
    expect(inCode(tree, doc.indexOf("indented"))).toBe(true);
    expect(inCode(tree, doc.indexOf("span"))).toBe(true);
    expect(inCode(tree, doc.indexOf("end"))).toBe(false);
  });

  it("sees a fence nested inside a container (list item)", () => {
    const doc = "- item\n  ```\n  code here\n  ```";
    const view = makeEditor(doc);
    const tree = viewportTree(view);
    expect(inCode(tree, doc.indexOf("item"))).toBe(false);
    expect(inCode(tree, doc.indexOf("code here"))).toBe(true);
  });
});
