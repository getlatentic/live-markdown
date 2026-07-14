// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor } from "./editorTestHarness";
import { editorBaseTheme } from "./editorTheme";

describe("editorBaseTheme", () => {
  afterEach(destroyEditors);

  it("mounts as a valid theme extension and still renders the document", () => {
    const view = makeEditor("# Heading", 0, [editorBaseTheme]);
    expect(view.dom.querySelector(".cm-content")?.textContent).toContain("Heading");
  });

  it("scopes its rules by adding a theme class to the editor wrapper", () => {
    const plain = makeEditor("x", 0);
    const themed = makeEditor("x", 0, [editorBaseTheme]);
    // EditorView.theme injects a generated host class onto `.cm-editor`,
    // so the themed wrapper carries one more class than the plain one.
    expect(themed.dom.classList.length).toBeGreaterThan(plain.dom.classList.length);
  });
});
