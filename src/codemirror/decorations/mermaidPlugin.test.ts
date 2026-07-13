// @vitest-environment jsdom
//
// Mermaid fences (#125): fence detection, the widget ↔ source swap around the
// caret, click-to-edit, the error state, and honest height estimates. The
// mermaid library itself is mocked — the real renderer needs a real layout
// engine and is covered by mermaid.browser.test.ts (WebKit tier).
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (_id: string, source: string) => {
      if (source.includes("boom")) {
        throw new Error("Parse error on line 2: …boom");
      }
      return { svg: `<svg data-mock="1"><desc>${source.length}</desc></svg>` };
    }),
  },
}));

import { EditorView } from "@codemirror/view";

import { fenceCaretGuard } from "./fenceCaretGuard";
import { estimateMermaidHeight, MermaidWidget } from "./mermaidWidget";
import { makeFullEditor, destroyEditors, caret } from "./editorTestHarness";

const fenced = (body: string, lang = "mermaid") => `before\n\n\`\`\`${lang}\n${body}\n\`\`\`\n\nafter`;

function widgetIn(view: EditorView): HTMLElement | null {
  return view.dom.querySelector(".cm-mermaid-block");
}

afterEach(() => {
  destroyEditors();
});

describe("mermaid fence rendering", () => {
  it("replaces a closed ```mermaid fence with a diagram block", async () => {
    const view = makeFullEditor(fenced("flowchart TD\n  A --> B"));
    const block = widgetIn(view);
    expect(block).toBeTruthy();
    // The fence source is fully hidden behind the widget.
    expect(view.contentDOM.textContent).not.toContain("flowchart");
    await vi.waitFor(() => {
      expect(block?.querySelector("svg[data-mock]")).toBeTruthy();
    });
  });

  it("accepts the language tag case-insensitively", () => {
    expect(widgetIn(makeFullEditor(fenced("graph LR\n  A --> B", "Mermaid")))).toBeTruthy();
  });

  it("leaves other fences and unclosed mermaid fences as source", () => {
    expect(widgetIn(makeFullEditor(fenced("const x = 1", "js")))).toBeNull();
    expect(widgetIn(makeFullEditor("text\n\n```mermaid\nflowchart TD\n  A --> B"))).toBeNull();
  });

  it("leaves a fence indented inside a list item as source", () => {
    const doc = "- item\n\n  ```mermaid\n  graph LR\n  ```\n";
    expect(widgetIn(makeFullEditor(doc))).toBeNull();
  });

  it("shows an inline error block when mermaid rejects the source", async () => {
    const view = makeFullEditor(fenced("flowchart boom"));
    await vi.waitFor(() => {
      expect(view.dom.querySelector(".cm-mermaid-block--error")).toBeTruthy();
    });
    expect(view.dom.querySelector(".cm-mermaid-error__message")?.textContent).toContain(
      "Parse error on line 2",
    );
  });
});

describe("caret ↔ widget swap", () => {
  const doc = fenced("sequenceDiagram\n  A->>B: hi");
  const insideFence = doc.indexOf("sequenceDiagram") + 3;

  it("reveals the source while the caret is inside the fence", () => {
    expect(widgetIn(makeFullEditor(doc, insideFence))).toBeNull();
  });

  it("re-renders the widget when the caret leaves", () => {
    const view = makeFullEditor(doc, insideFence);
    view.dispatch({ selection: { anchor: 0 } });
    expect(widgetIn(view)).toBeTruthy();
  });

  it("reveals when a selection ENDPOINT lands inside the fence", () => {
    const view = makeFullEditor(doc);
    view.dispatch({ selection: { anchor: 0, head: insideFence } });
    expect(widgetIn(view)).toBeNull();
  });

  it("keeps the diagram rendered when a selection merely SPANS it (copy flow)", () => {
    // Field report: drag-selecting across a diagram to copy it flipped it to
    // source mid-drag — reading as "copying turns it back into code". The
    // clipboard is built from the markdown either way; the diagram stays.
    const view = makeFullEditor(doc);
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    expect(widgetIn(view)).toBeTruthy();
  });

  it("a caret merely ADJACENT to the fence keeps the diagram rendered", () => {
    const view = makeFullEditor(doc);
    const fenceStart = doc.indexOf("```mermaid");
    view.dispatch({ selection: { anchor: fenceStart } });
    expect(widgetIn(view)).toBeTruthy();
  });

  it("click selects the diagram as a block — still rendered, marked selected", () => {
    // Field report: click-to-edit made copying impossible without flashing to
    // source. A diagram is an object first: click → select → ⌘C.
    const view = makeFullEditor(doc);
    const block = widgetIn(view);
    block?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    const selected = widgetIn(view);
    expect(selected).toBeTruthy();
    expect(selected?.classList.contains("cm-mermaid-block--selected")).toBe(true);
    const { from, to } = view.state.selection.main;
    expect(view.state.sliceDoc(from, to)).toBe(
      "```mermaid\nsequenceDiagram\n  A->>B: hi\n```",
    );
  });

  it("double-click reveals the source with the caret on the first line", () => {
    const view = makeFullEditor(doc);
    widgetIn(view)?.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true, detail: 2 }),
    );
    expect(widgetIn(view)).toBeNull();
    expect(caret(view)).toBe(doc.indexOf("sequenceDiagram"));
  });

  it("a click landing on the fence's marker rows does NOT reveal (guard interplay)", () => {
    // Field report: clicking just above/below the diagram flipped it to code.
    // Those clicks map to the opener/closer rows, where fenceCaretGuard used
    // to move the caret INTO the content — an interior endpoint, a reveal.
    // The guard now snaps to the OUTSIDE boundary for widget-covered fences.
    // The guard is wired in the editor shell, not the extension bundle, so it
    // must be added explicitly here — that omission is how this slipped.
    const view = makeFullEditor(doc, 0, [fenceCaretGuard]);
    const fenceStart = doc.indexOf("```mermaid");
    const fenceEnd = doc.indexOf("\n\nafter");

    view.dispatch({ selection: { anchor: fenceStart + 2 }, userEvent: "select.pointer" });
    expect(widgetIn(view)).toBeTruthy();
    expect(caret(view)).toBe(fenceStart);

    view.dispatch({ selection: { anchor: fenceEnd - 1 }, userEvent: "select.pointer" });
    expect(widgetIn(view)).toBeTruthy();
    expect(caret(view)).toBe(fenceEnd);
  });

  it("the guard still enters PLAIN code fences from their marker rows (§12.9)", () => {
    const codeDoc = "before\n\n```js\nconst x = 1\n```\n\nafter";
    const view = makeFullEditor(codeDoc, 0, [fenceCaretGuard]);
    const fenceStart = codeDoc.indexOf("```js");
    view.dispatch({ selection: { anchor: fenceStart }, userEvent: "select.pointer" });
    expect(caret(view)).toBe(codeDoc.indexOf("const"));
  });

  it("the Edit chip reveals the source", async () => {
    const view = makeFullEditor(doc);
    await vi.waitFor(() => {
      expect(widgetIn(view)?.querySelector(".cm-mermaid-edit")).toBeTruthy();
    });
    widgetIn(view)
      ?.querySelector(".cm-mermaid-edit")
      ?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(widgetIn(view)).toBeNull();
    expect(caret(view)).toBe(doc.indexOf("sequenceDiagram"));
  });
});

describe("height estimates (#120 contract)", () => {
  it("scales with source lines within honest bounds", () => {
    expect(estimateMermaidHeight("")).toBe(140);
    expect(estimateMermaidHeight("a\nb\nc")).toBe(96 + 3 * 32);
    expect(estimateMermaidHeight(Array(40).fill("x").join("\n"))).toBe(520);
  });

  it("backs the widget's estimatedHeight before any measurement", () => {
    const widget = new MermaidWidget("unmeasured-1\nunmeasured-2");
    expect(widget.estimatedHeight).toBe(96 + 2 * 32);
  });

  it("treats widgets as equal iff sources match, so edits elsewhere reuse the DOM", () => {
    expect(new MermaidWidget("graph LR").eq(new MermaidWidget("graph LR"))).toBe(true);
    expect(new MermaidWidget("graph LR").eq(new MermaidWidget("graph TD"))).toBe(false);
  });
});
