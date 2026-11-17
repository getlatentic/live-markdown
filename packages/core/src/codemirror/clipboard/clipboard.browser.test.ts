/**
 * Clipboard interop handlers (#134/#135) in real WebKit — the engine Compose
 * ships on — because jsdom has no DataTransfer constructor. Events are
 * synthetic but carry REAL DataTransfer objects, so what's asserted is our
 * handlers' flavor logic, not the OS pasteboard (that part is live-verified
 * in the packaged app).
 */

import { afterEach, describe, expect, it } from "vitest";

import { destroyEditors, makeEditor, text } from "../core/editorTestHarness";
import { markdownPaste } from "./pasteMarkdown";
import { renderClipboardHtmlFacet, richCopy } from "./copyRich";
import { COMPOSE_CLIPBOARD_ATTR } from "./htmlToMarkdown";
import { EditorSelection } from "@codemirror/state";

afterEach(destroyEditors);

function pasteEvent(flavors: Record<string, string>): ClipboardEvent {
  const data = new DataTransfer();
  for (const [type, value] of Object.entries(flavors)) {
    data.setData(type, value);
  }
  return new ClipboardEvent("paste", { clipboardData: data, cancelable: true, bubbles: true });
}

function clipboardEvent(kind: "copy" | "cut"): ClipboardEvent {
  return new ClipboardEvent(kind, {
    clipboardData: new DataTransfer(),
    cancelable: true,
    bubbles: true,
  });
}

describe("markdownPaste (#134)", () => {
  it("converts an HTML paste to markdown at the caret", () => {
    const view = makeEditor("start ", 6, [markdownPaste]);

    const event = pasteEvent({
      "text/html": "<p><strong>bold</strong> and <em>fine</em></p>",
      "text/plain": "bold and fine",
    });
    view.contentDOM.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(text(view)).toBe("start **bold** and *fine*");
  });

  it("leaves Compose's own copies to the plain-markdown path", () => {
    const view = makeEditor("", 0, [markdownPaste]);

    const event = pasteEvent({
      "text/html": `<div ${COMPOSE_CLIPBOARD_ATTR}="true"><p><strong>rendered</strong></p></div>`,
      "text/plain": "**source**",
    });
    view.contentDOM.dispatchEvent(event);

    // Our handler declines; CM's native paste inserts the text/plain flavor.
    expect(text(view)).toBe("**source**");
  });

  it("leaves plain-only pastes to the native path", () => {
    const view = makeEditor("", 0, [markdownPaste]);

    const event = pasteEvent({ "text/plain": "just text" });
    view.contentDOM.dispatchEvent(event);

    expect(text(view)).toBe("just text");
  });
});

describe("richCopy (#135)", () => {
  const render = renderClipboardHtmlFacet.of(
    (markdown) => `<p>rendered:${markdown.length}</p>`,
  );

  it("writes both flavors, marks the HTML as Compose's own", () => {
    const view = makeEditor("# Title\n\nBody here", 0, [richCopy, render]);
    view.dispatch({ selection: EditorSelection.range(0, 7) });

    const event = clipboardEvent("copy");
    view.contentDOM.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(event.clipboardData?.getData("text/plain")).toBe("# Title");
    const html = event.clipboardData?.getData("text/html") ?? "";
    expect(html).toContain(COMPOSE_CLIPBOARD_ATTR);
    expect(html).toContain("rendered:7");
    expect(text(view)).toBe("# Title\n\nBody here");
  });

  it("copies plain-only when the host provides no renderer", () => {
    const view = makeEditor("hello world", 0, [richCopy]);
    view.dispatch({ selection: EditorSelection.range(0, 5) });

    const event = clipboardEvent("copy");
    view.contentDOM.dispatchEvent(event);

    expect(event.clipboardData?.getData("text/plain")).toBe("hello");
    expect(event.clipboardData?.getData("text/html")).toBe("");
  });

  it("cut removes the selection after writing the flavors", () => {
    const view = makeEditor("cut me please", 0, [richCopy, render]);
    view.dispatch({ selection: EditorSelection.range(0, 7) });

    const event = clipboardEvent("cut");
    view.contentDOM.dispatchEvent(event);

    expect(event.clipboardData?.getData("text/plain")).toBe("cut me ");
    expect(text(view)).toBe("please");
  });

  it("stands down when another handler already claimed the event (table TSV copy)", () => {
    const view = makeEditor("abc", 0, [richCopy, render]);
    view.dispatch({ selection: EditorSelection.range(0, 3) });

    const event = clipboardEvent("copy");
    event.preventDefault();
    view.contentDOM.dispatchEvent(event);

    expect(event.clipboardData?.getData("text/plain")).toBe("");
  });

  it("ignores empty selections (native line-copy behavior stays)", () => {
    const view = makeEditor("abc", 1, [richCopy, render]);

    const event = clipboardEvent("copy");
    view.contentDOM.dispatchEvent(event);

    expect(event.clipboardData?.getData("text/html")).toBe("");
  });
});
