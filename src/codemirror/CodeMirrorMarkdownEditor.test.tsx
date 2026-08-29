// @vitest-environment jsdom
//
// Integration test for the editor React component: mounts the real
// component (effects + a live CodeMirror EditorView) and exercises the
// glue the unit tests can't — frontmatter split, the wysiwyg/source
// extension switch, the debounced onChange autosave, the synchronous
// flush bridge, and external-value patching.
//
// Mounted with react-dom/client + React 18.3's `act` (no RTL dep). The
// live view is captured through the `toolbar` slot. The selection-poll
// rAF is stubbed to a no-op so it can't churn state mid-assertion; only
// `setTimeout` is faked, to drive the autosave debounce deterministically.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorView } from "@codemirror/view";

import {
  CodeMirrorMarkdownEditor,
  type CodeMirrorMarkdownEditorProps,
} from "./CodeMirrorMarkdownEditor";
import { markdownDecorationsPlugin } from "./core/plugin";
import { type MarkdownExtension, type ToolbarContribution } from "./extensions";
import { Facet } from "@codemirror/state";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let view: EditorView | null;
let toolbarContributions: readonly ToolbarContribution[] = [];

function renderEditor(
  props: Partial<CodeMirrorMarkdownEditorProps> & { value: string },
): { onChange: ReturnType<typeof vi.fn> } {
  const onChange = (props.onChange as ReturnType<typeof vi.fn>) ?? vi.fn();
  act(() => {
    root.render(
      <CodeMirrorMarkdownEditor
        {...props}
        onChange={onChange}
        toolbar={({ view: v, contributions }) => {
          view = v;
          toolbarContributions = contributions;
          return null;
        }}
      />,
    );
  });
  return { onChange };
}

function content(): string {
  return container.querySelector(".cm-content")?.textContent ?? "";
}

function typeAtEnd(insert: string): void {
  act(() => {
    view!.dispatch({ changes: { from: view!.state.doc.length, insert } });
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  view = null;
  toolbarContributions = [];
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CodeMirrorMarkdownEditor (integration)", () => {
  it("mounts a live CodeMirror editor rendering the markdown body", () => {
    renderEditor({ value: "# Hello world" });
    expect(container.querySelector(".cm-editor")).not.toBeNull();
    expect(view).not.toBeNull();
    expect(content()).toContain("Hello world");
  });

  it("holds YAML frontmatter out of the editing surface", () => {
    renderEditor({ value: "---\ntitle: Secret Title\n---\n\nVisible body" });
    expect(content()).toContain("Visible body");
    expect(content()).not.toContain("Secret Title");
  });

  it("wires decorations on in wysiwyg mode and off in source mode", () => {
    renderEditor({ value: "# H", mode: "wysiwyg" });
    expect(view!.plugin(markdownDecorationsPlugin)).not.toBeNull();
    renderEditor({ value: "# H", mode: "source" });
    expect(view!.plugin(markdownDecorationsPlugin)).toBeNull();
  });

  it("emits onChange with the edited content after the autosave debounce", () => {
    const { onChange } = renderEditor({ value: "hello" });
    typeAtEnd(" world");
    expect(onChange).not.toHaveBeenCalled(); // still within the debounce window
    act(() => vi.advanceTimersByTime(600));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBe("hello world");
  });

  it("recombines frontmatter into the saved value on autosave", () => {
    const { onChange } = renderEditor({
      value: "---\ntitle: Secret Title\n---\n\nBody",
    });
    typeAtEnd(" edited");
    act(() => vi.advanceTimersByTime(600));
    expect(onChange).toHaveBeenCalledTimes(1);
    const saved = onChange.mock.calls[0][0] as string;
    expect(saved).toContain("title: Secret Title");
    expect(saved).toContain("Body edited");
  });

  it("flushes pending content synchronously via onFlushReady, cancelling the debounce", () => {
    let flush: (() => void) | null = null;
    const { onChange } = renderEditor({
      value: "hello",
      onFlushReady: (f) => {
        flush = f;
      },
    });
    expect(flush).toBeTypeOf("function");
    typeAtEnd(" world");
    act(() => flush!());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBe("hello world");
    // The pending debounce was cancelled — no second (echoed) save fires.
    act(() => vi.advanceTimersByTime(600));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("patches the document when the external value prop changes", () => {
    renderEditor({ value: "first body" });
    expect(content()).toContain("first body");
    renderEditor({ value: "second body" });
    expect(content()).toContain("second body");
    expect(content()).not.toContain("first body");
  });
});

describe("first edit after a programmatic state swap still saves (#108)", () => {
  it("a single edit made right after switching to source mode autosaves", () => {
    const onChange = vi.fn();
    renderEditor({ value: "keep\nstray", mode: "wysiwyg", onChange });
    renderEditor({ value: "keep\nstray", mode: "source", onChange });
    // The user's lone RAW-mode edit: delete the second line.
    act(() => {
      view!.dispatch({
        changes: { from: "keep".length, to: view!.state.doc.length, insert: "" },
      });
    });
    act(() => vi.advanceTimersByTime(600));
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][0]).toBe("keep");
  });

  it("a single edit right after a tab switch autosaves", () => {
    const onChange = vi.fn();
    renderEditor({ value: "alpha", filePath: "a.md", onChange });
    renderEditor({ value: "beta", filePath: "b.md", onChange });
    typeAtEnd("!");
    act(() => vi.advanceTimersByTime(600));
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][0]).toBe("beta!");
  });

  it("Cmd+S flush right after a lone source-mode edit persists it", () => {
    const onChange = vi.fn();
    let flush: (() => void) | null = null;
    renderEditor({
      value: "keep\nstray",
      mode: "wysiwyg",
      onChange,
      onFlushReady: (f) => {
        flush = f;
      },
    });
    renderEditor({
      value: "keep\nstray",
      mode: "source",
      onChange,
      onFlushReady: (f) => {
        flush = f;
      },
    });
    act(() => {
      view!.dispatch({
        changes: { from: "keep".length, to: view!.state.doc.length, insert: "" },
      });
    });
    act(() => flush!());
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][0]).toBe("keep");
  });

  describe("host-contributed extensions", () => {
    // A facet is the smallest thing that proves an extension really reached the
    // live EditorState, rather than merely being accepted as a prop.
    const marker = Facet.define<string, string[]>({ combine: (v) => [...v] });
    const hostModule: MarkdownExtension = {
      name: "host-test",
      version: "1.0.0",
      extensions: [marker.of("installed")],
    };

    it("installs a host module's CodeMirror extensions into the live state", () => {
      renderEditor({ value: "hello", extensions: [hostModule] });
      expect(view!.state.facet(marker)).toContain("installed");
    });

    it("installs them in SOURCE mode too, not just wysiwyg", () => {
      // A keymap or a plain CodeMirror extension is not a markdown-rendering
      // concern; dropping it with the decoration painter would be surprising.
      renderEditor({ value: "hello", mode: "source", extensions: [hostModule] });
      expect(view!.state.facet(marker)).toContain("installed");
    });

    it("installs nothing extra when the host passes none", () => {
      renderEditor({ value: "hello" });
      expect(view!.state.facet(marker)).toEqual([]);
    });

    it("hands the module's toolbar items to the toolbar slot", () => {
      // Previously the merger collected these and the component dropped them,
      // so a host contributing a toolbar item silently got nothing.
      const withToolbar: MarkdownExtension = {
        name: "host-toolbar",
        version: "1.0.0",
        toolbar: [
          { id: "shout", group: "insert", label: "Shout", icon: null, run: () => {} },
        ],
      };
      renderEditor({ value: "hello", extensions: [withToolbar] });
      expect(toolbarContributions.map((c) => c.id)).toEqual(["shout"]);
    });
  });
});
