// @vitest-environment jsdom
import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorView } from "@codemirror/view";

import type { CaretContextSnapshot } from "@latentic/live-markdown-core/codemirror/extensions/types";
import type { EditorSelectionSnapshot } from "@latentic/live-markdown-core/codemirror/selectionSnapshot";
import { useCaretContext, useEditorSelection, useMarkdownEditor } from ".";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let seen: { view: EditorView | null; caret: CaretContextSnapshot; selection: EditorSelectionSnapshot | null };

/** A host that draws its own frame: the hooks, and nothing of the component. */
function OwnEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { ref, view } = useMarkdownEditor({ value, onChange });
  const caret = useCaretContext(view);
  const selection = useEditorSelection(view);
  seen = { view, caret, selection };
  return (
    <section>
      <output>{caret.bold ? "bold" : "plain"}</output>
      <div ref={ref} />
    </section>
  );
}

function render(element: ReactNode): void {
  act(() => root.render(element));
}

const view = () => seen.view!;
const dispatch = (spec: Parameters<EditorView["dispatch"]>[0]) => act(() => view().dispatch(spec));

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useMarkdownEditor", () => {
  it("mounts the editor in the caller's element and reports edits as the whole file", () => {
    const onChange = vi.fn();
    render(<OwnEditor value={"---\na: 1\n---\nBody"} onChange={onChange} />);
    expect(container.querySelector("section > div > .cm-editor")).not.toBeNull();
    expect(view().state.doc.toString()).toBe("Body");
    dispatch({ changes: { from: 4, insert: "!" } });
    act(() => vi.advanceTimersByTime(500));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("---\na: 1\n---\nBody!", []);
  });

  it("shows a value set from outside", () => {
    render(<OwnEditor value="One" onChange={vi.fn()} />);
    render(<OwnEditor value="Two" onChange={vi.fn()} />);
    expect(view().state.doc.toString()).toBe("Two");
  });

  it("leaves one editor in the element under StrictMode, which mounts twice", () => {
    render(
      <StrictMode>
        <OwnEditor value="One" onChange={vi.fn()} />
      </StrictMode>,
    );
    expect(container.querySelectorAll(".cm-editor")).toHaveLength(1);
    expect(view().dom.isConnected).toBe(true);
  });

  it("calls the latest onChange, not the one it mounted with", () => {
    const first = vi.fn();
    const second = vi.fn();
    render(<OwnEditor value="One" onChange={first} />);
    render(<OwnEditor value="One" onChange={second} />);
    dispatch({ changes: { from: 3, insert: "!" } });
    act(() => vi.advanceTimersByTime(500));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("One!", []);
  });
});

describe("useCaretContext", () => {
  it("follows the caret into bold and out again", () => {
    render(<OwnEditor value="plain **bold**" onChange={vi.fn()} />);
    expect(container.querySelector("output")!.textContent).toBe("plain");
    dispatch({ selection: { anchor: 10 } });
    expect(seen.caret.bold).toBe(true);
    expect(container.querySelector("output")!.textContent).toBe("bold");
    dispatch({ selection: { anchor: 1 } });
    expect(seen.caret.bold).toBe(false);
  });
});

describe("useEditorSelection", () => {
  it("is the selected text, and null for a caret", () => {
    render(<OwnEditor value="pick these words" onChange={vi.fn()} />);
    expect(seen.selection).toBeNull();
    dispatch({ selection: { anchor: 5, head: 10 } });
    expect(seen.selection).toEqual({ range: { start: 5, end: 10 }, text: "these" });
    dispatch({ selection: { anchor: 3 } });
    expect(seen.selection).toBeNull();
  });
});
