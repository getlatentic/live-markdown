/**
 * @browser: mermaid fences (#125) with the REAL renderer — the library needs
 * an actual layout engine (getBBox et al.), so render output, the measured-
 * height cache, the error state, and click-to-edit run in WebKit.
 */

import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { userEvent } from "@vitest/browser/context";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mermaidField } from "./mermaidPlugin";
import { getCachedMermaidPng, warmMermaidPng } from "./mermaidRender";
import { MermaidWidget } from "./mermaidWidget";

let view: EditorView | null = null;

function makeView(doc: string): EditorView {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage }), mermaidField],
  });
  ensureSyntaxTree(state, doc.length, 5000);
  view = new EditorView({ state, parent: document.body });
  return view;
}

afterEach(() => {
  view?.destroy();
  view = null;
});

const FLOWCHART = "flowchart TD\n  A[Start] --> B[End]";
const fenced = (body: string) => `before\n\n\`\`\`mermaid\n${body}\n\`\`\`\n\nafter`;

describe("mermaid rendering in a real browser", () => {
  it("renders a closed fence to a real SVG diagram", async () => {
    const editor = makeView(fenced(FLOWCHART));
    const block = editor.dom.querySelector<HTMLElement>(".cm-mermaid-block");
    expect(block).toBeTruthy();
    await vi.waitFor(
      () => {
        expect(block?.querySelector("svg")).toBeTruthy();
      },
      { timeout: 10_000 },
    );
    expect(block!.offsetHeight).toBeGreaterThan(40);
  });

  it("caches the measured height so re-created widgets estimate honestly", async () => {
    const editor = makeView(fenced(FLOWCHART));
    const block = editor.dom.querySelector<HTMLElement>(".cm-mermaid-block")!;
    await vi.waitFor(() => expect(block.querySelector("svg")).toBeTruthy(), { timeout: 10_000 });
    // The requestMeasure pass records the height; a fresh widget over the
    // same source must answer with the real value, not the line heuristic.
    await vi.waitFor(() => {
      expect(new MermaidWidget(FLOWCHART).estimatedHeight).toBe(block.offsetHeight);
    });
  });

  it("shows the inline error state for invalid source, never a blank", async () => {
    const editor = makeView(fenced("flowchart TD\n  A --> ;;nope;;"));
    await vi.waitFor(
      () => {
        expect(editor.dom.querySelector(".cm-mermaid-block--error")).toBeTruthy();
      },
      { timeout: 10_000 },
    );
    const message = editor.dom.querySelector(".cm-mermaid-error__message")?.textContent ?? "";
    expect(message.length).toBeGreaterThan(0);
  });

  it("warms a clipboard PNG for a diagram (real rasterisation)", async () => {
    const source = "flowchart LR\n  P[PNG] --> C[Clipboard]";
    await warmMermaidPng(source);
    const png = getCachedMermaidPng(source);
    expect(png).not.toBeNull();
    expect(png!.startsWith("data:image/png;base64,")).toBe(true);
    // A real raster, not a 1×1 stub: decode it and check the dimensions.
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("png failed to decode"));
      image.src = png!;
    });
    expect(image.naturalWidth).toBeGreaterThan(50);
    expect(image.naturalHeight).toBeGreaterThan(20);
  });

  it("click selects the diagram (still rendered); double-click reveals the source", async () => {
    const editor = makeView(fenced(FLOWCHART));
    const block = editor.dom.querySelector<HTMLElement>(".cm-mermaid-block")!;
    await vi.waitFor(() => expect(block.querySelector("svg")).toBeTruthy(), { timeout: 10_000 });

    await userEvent.click(block);
    const selected = editor.dom.querySelector<HTMLElement>(".cm-mermaid-block");
    expect(selected).toBeTruthy();
    expect(selected!.classList.contains("cm-mermaid-block--selected")).toBe(true);
    const { from, to } = editor.state.selection.main;
    expect(editor.state.sliceDoc(from, to)).toContain("```mermaid");
    expect(editor.state.sliceDoc(from, to)).toContain("```\n".trimEnd());

    await userEvent.dblClick(selected!);
    expect(editor.dom.querySelector(".cm-mermaid-block")).toBeNull();
    expect(editor.contentDOM.textContent).toContain("flowchart TD");
    const line = editor.state.doc.lineAt(editor.state.selection.main.head);
    expect(line.text).toBe("flowchart TD");
  });
});
