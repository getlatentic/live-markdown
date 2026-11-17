// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor, makeFullEditor } from "./editorTestHarness";
import { HorizontalRuleWidget } from "./hrWidget";

describe("HorizontalRuleWidget", () => {
  afterEach(destroyEditors);

  it("renders span.cm-hr-widget", () => {
    const dom = new HorizontalRuleWidget().toDOM(makeEditor("x", 0));
    expect(dom.tagName).toBe("SPAN");
    expect(dom.className).toBe("cm-hr-widget");
  });

  it("eq() is always true and ignoreEvent() is false", () => {
    expect(new HorizontalRuleWidget().eq(new HorizontalRuleWidget())).toBe(true);
    expect(new HorizontalRuleWidget().ignoreEvent()).toBe(false);
  });
});

describe("a horizontal rule and the caret", () => {
  afterEach(destroyEditors);

  const drawn = (doc: string, caret: number) => {
    const view = makeFullEditor(doc, caret);
    document.body.appendChild(view.dom);
    return { view, widget: () => view.dom.querySelector(".cm-hr-widget") !== null };
  };

  it.each([0, 6, 9])("is drawn as a line with the caret at %i, outside it", (caret) => {
    expect(drawn("text\n\n---", caret).widget()).toBe(true);
  });

  it("shows its source while the caret is between its characters", () => {
    const { view, widget } = drawn("text\n\n---", 7);
    expect(widget()).toBe(false);
    expect(view.contentDOM.textContent).toContain("---");
  });

  it("is drawn as a line again when the caret leaves it", () => {
    const { view, widget } = drawn("text\n\n---", 7);
    view.dispatch({ selection: { anchor: 0 } });
    expect(widget()).toBe(true);
  });

  it("shows its source when an edit puts the caret inside it", () => {
    const { view, widget } = drawn("text\n\n---", 6);
    view.dispatch({ changes: { from: 6, insert: "-" }, selection: { anchor: 7 } });
    expect(widget()).toBe(false);
  });

  it("stays a line while a selection covers it", () => {
    const { view, widget } = drawn("text\n\n---", 0);
    view.dispatch({ selection: { anchor: 0, head: 8 } });
    expect(widget()).toBe(true);
  });
});
