// @vitest-environment jsdom
import { Facet } from "@codemirror/state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { markdownDecorationsPlugin } from "./codemirror/core/plugin";
import { openExternalUrlFacet } from "./codemirror/core";
import { type MarkdownExtension } from "./codemirror/extensions";
import { createMarkdownEditor, type MarkdownEditor, type MarkdownEditorOptions } from "./createMarkdownEditor";

let parent: HTMLDivElement;
let editor: MarkdownEditor<string>;
/** Queued, not run: CodeMirror's own measure pass cannot run in jsdom. */
let frames: Array<() => void>;

function create(options: Partial<MarkdownEditorOptions<string>> & { value: string }) {
  const onChange = vi.fn();
  editor = createMarkdownEditor<string>(parent, { onChange, ...options });
  return onChange;
}

function typeAtEnd(insert: string): void {
  editor.view.dispatch({ changes: { from: editor.view.state.doc.length, insert } });
}

function body(): string {
  return editor.view.state.doc.toString();
}

beforeEach(() => {
  parent = document.createElement("div");
  document.body.appendChild(parent);
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (run: () => void) => frames.push(run));
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  editor.destroy();
  parent.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("createMarkdownEditor", () => {
  it("mounts a CodeMirror view in the element, with the front matter held out", () => {
    create({ value: "---\ntitle: A\n---\n# Hello" });
    expect(parent.querySelector(".cm-editor")).not.toBeNull();
    expect(body()).toBe("# Hello");
    expect(editor.getValue()).toBe("---\ntitle: A\n---\n# Hello");
  });

  it("emits the whole file 500 ms after an edit, front matter included", () => {
    const onChange = create({ value: "---\ntitle: A\n---\nBody" });
    typeAtEnd("!");
    vi.advanceTimersByTime(499);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledExactlyOnceWith("---\ntitle: A\n---\nBody!", []);
  });

  it("flush emits a pending edit at once and the timer then stays silent", () => {
    const onChange = create({ value: "Body" });
    typeAtEnd("!");
    editor.flush();
    expect(onChange).toHaveBeenCalledExactlyOnceWith("Body!", []);
    vi.advanceTimersByTime(1000);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("flush with nothing pending emits nothing", () => {
    const onChange = create({ value: "Body" });
    editor.flush();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("setValue replaces the content without emitting", () => {
    const onChange = create({ value: "One" });
    editor.setValue("---\na: 1\n---\nTwo");
    expect(body()).toBe("Two");
    vi.advanceTimersByTime(1000);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores its own output fed back in, keeping the caret", () => {
    const onChange = create({ value: "One" });
    typeAtEnd(" two");
    editor.view.dispatch({ selection: { anchor: 2 } });
    editor.flush();
    editor.setValue(onChange.mock.calls[0][0]);
    expect(editor.view.state.selection.main.head).toBe(2);
  });

  it("an edit made right after a programmatic replace still emits", () => {
    const onChange = create({ value: "One" });
    editor.setValue("Two");
    typeAtEnd("!");
    vi.advanceTimersByTime(500);
    expect(onChange).toHaveBeenCalledExactlyOnceWith("Two!", []);
  });

  it("destroy drops a pending edit", () => {
    const onChange = create({ value: "Body" });
    typeAtEnd("!");
    editor.destroy();
    vi.advanceTimersByTime(1000);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("rebuilding the editor without losing typing", () => {
  it("pendingEdit is the unemitted text, and null once it is emitted", () => {
    create({ value: "---\na: 1\n---\nBody" });
    expect(editor.pendingEdit()).toBeNull();
    typeAtEnd("!");
    expect(editor.pendingEdit()).toBe("---\na: 1\n---\nBody!");
    editor.flush();
    expect(editor.pendingEdit()).toBeNull();
  });

  it("a draft handed to the next editor is shown and emitted after the delay", () => {
    create({ value: "Body" });
    typeAtEnd("!");
    const draft = editor.pendingEdit();
    editor.destroy();
    const onChange = create({ value: "Body", draft });
    expect(body()).toBe("Body!");
    vi.advanceTimersByTime(500);
    expect(onChange).toHaveBeenCalledExactlyOnceWith("Body!", []);
  });

  it("no draft, or one equal to the value, emits nothing", () => {
    const onChange = create({ value: "Body", draft: "Body" });
    vi.advanceTimersByTime(1000);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("switching documents", () => {
  it("emits the outgoing document's pending edit before the switch", () => {
    const onChange = create({ value: "A", filePath: "a.md" });
    typeAtEnd("!");
    editor.setDocument("B", "b.md");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("A!", []);
    expect(body()).toBe("B");
    vi.advanceTimersByTime(1000);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("restores caret and undo history on the way back", () => {
    create({ value: "Alpha", filePath: "a.md" });
    typeAtEnd(" beta");
    editor.view.dispatch({ selection: { anchor: 3 } });
    const stateOfA = editor.view.state;
    editor.setDocument("B", "b.md");
    editor.setDocument("Alpha beta", "a.md");
    expect(editor.view.state).toBe(stateOfA);
    expect(editor.view.state.selection.main.head).toBe(3);
  });

  it("rebuilds a document whose file changed while it was away", () => {
    create({ value: "Alpha", filePath: "a.md" });
    const stateOfA = editor.view.state;
    editor.setDocument("B", "b.md");
    editor.setDocument("Changed on disk", "a.md");
    expect(editor.view.state).not.toBe(stateOfA);
    expect(body()).toBe("Changed on disk");
  });

  it("an edit right after a switch emits against the new document", () => {
    const onChange = create({ value: "A", filePath: "a.md" });
    editor.setDocument("B", "b.md");
    typeAtEnd("!");
    vi.advanceTimersByTime(500);
    expect(onChange).toHaveBeenCalledExactlyOnceWith("B!", []);
  });

  it("reports the swap after it has painted", () => {
    const onAfterContentSwap = vi.fn();
    create({ value: "A", filePath: "a.md", onAfterContentSwap });
    editor.setValue("A2");
    frames = [];
    editor.setDocument("B", "b.md");
    expect(onAfterContentSwap).not.toHaveBeenCalled();
    frames[frames.length - 1]();
    expect(onAfterContentSwap).toHaveBeenCalledTimes(1);
  });
});

describe("mode", () => {
  const decorated = () => editor.view.plugin(markdownDecorationsPlugin) !== null;

  it("decorates in wysiwyg and not in source", () => {
    create({ value: "# H" });
    expect(decorated()).toBe(true);
    editor.setMode("source");
    expect(decorated()).toBe(false);
    editor.setMode("wysiwyg");
    expect(decorated()).toBe(true);
  });

  it("keeps the live text across a mode change, and the next edit emits", () => {
    const onChange = create({ value: "Body", filePath: "a.md" });
    typeAtEnd("!");
    editor.setMode("source");
    expect(body()).toBe("Body!");
    typeAtEnd("?");
    vi.advanceTimersByTime(500);
    expect(onChange).toHaveBeenLastCalledWith("Body!?", []);
  });
});

describe("host settings", () => {
  const marker = Facet.define<string, readonly string[]>();
  const hostModule: MarkdownExtension<string> = {
    name: "host",
    version: "1.0.0",
    extensions: [marker.of("installed")],
    toolbar: [{ id: "x", group: "insert", label: "X", icon: "<svg/>", run: () => {} }],
  };

  it("installs a host module in both modes and exposes its toolbar items", () => {
    create({ value: "A", extensions: [hostModule] });
    expect(editor.view.state.facet(marker)).toEqual(["installed"]);
    expect(editor.toolbar.map((item) => item.id)).toEqual(["x"]);
    editor.setMode("source");
    expect(editor.view.state.facet(marker)).toEqual(["installed"]);
  });

  it("calls the latest callback, not the one given at build time", () => {
    const first = vi.fn();
    const second = vi.fn();
    const onChange = create({ value: "A", onOpenExternalUrl: first });
    editor.setOptions({ onOpenExternalUrl: second, onChange });
    editor.view.state.facet(openExternalUrlFacet)("https://example.com");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("https://example.com");
  });

  it("setOptions replaces onChange for the next emit", () => {
    create({ value: "A" });
    const next = vi.fn();
    editor.setOptions({ onChange: next });
    typeAtEnd("!");
    editor.flush();
    expect(next).toHaveBeenCalledExactlyOnceWith("A!", []);
  });
});
