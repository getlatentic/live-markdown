// @vitest-environment jsdom
import type { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref, type App, type Ref } from "vue";

import { MarkdownEditor, type MarkdownEditorExposed } from "./MarkdownEditor";

let container: HTMLDivElement;
let app: App;
let exposed: Ref<MarkdownEditorExposed | null>;

/** A parent with `v-model`, as an app writes it. */
function mount(model: Ref<string>, props: Record<string, unknown> | (() => Record<string, unknown>) = {}) {
  exposed = ref(null);
  const Parent = defineComponent({
    setup: () => () =>
      h(
        MarkdownEditor,
        {
          ref: exposed,
          modelValue: model.value,
          "onUpdate:modelValue": (value: string) => (model.value = value),
          ...(typeof props === "function" ? props() : props),
        },
        { toolbar: ({ contributions }: { contributions: readonly { id: string }[] }) => h("nav", contributions.length) },
      ),
  });
  app = createApp(Parent);
  app.mount(container);
}

const view = (): EditorView => exposed.value!.view()!;
const body = (): string => view().state.doc.toString();
const typeAtEnd = (insert: string) => view().dispatch({ changes: { from: view().state.doc.length, insert } });

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  app.unmount();
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("<MarkdownEditor> for Vue", () => {
  it("mounts the editor with the model's body and renders the toolbar slot", () => {
    mount(ref("---\ntitle: A\n---\n# Hello"));
    expect(container.querySelector(".cm-editor-host__scroll .cm-editor")).not.toBeNull();
    expect(body()).toBe("# Hello");
  });

  it("updates the model 500 ms after an edit, and the echo does not move the caret", async () => {
    const model = ref("One");
    mount(model);
    typeAtEnd(" two");
    view().dispatch({ selection: { anchor: 1 } });
    vi.advanceTimersByTime(500);
    expect(model.value).toBe("One two");
    await nextTick();
    expect(view().state.selection.main.head).toBe(1);
  });

  it("flush on the template ref updates the model at once", () => {
    const model = ref("One");
    mount(model);
    typeAtEnd("!");
    exposed.value!.flush();
    expect(model.value).toBe("One!");
  });

  it("shows a model changed from outside", async () => {
    const model = ref("One");
    mount(model);
    model.value = "Two";
    await nextTick();
    expect(body()).toBe("Two");
  });

  it("switches document on a new file path, saving the outgoing edit to the model first", async () => {
    const model = ref("A");
    const filePath = ref("a.md");
    const saved: string[] = [];
    exposed = ref(null);
    app = createApp({
      setup: () => () =>
        h(MarkdownEditor, {
          ref: exposed,
          modelValue: model.value,
          filePath: filePath.value,
          "onUpdate:modelValue": (value: string) => saved.push(value),
        }),
    });
    app.mount(container);
    typeAtEnd("!");
    model.value = "B";
    filePath.value = "b.md";
    await nextTick();
    expect(saved).toEqual(["A!"]);
    expect(body()).toBe("B");
  });

  it("turns the rendering off in source mode", async () => {
    const mode = ref("wysiwyg");
    mount(ref("# H"), () => ({ mode: mode.value }));
    const rendered = () => container.querySelector(".cm-content")!.textContent;
    expect(rendered()).toBe("H");
    mode.value = "source";
    await nextTick();
    expect(rendered()).toBe("# H");
  });

  it("removes the editor on unmount", () => {
    mount(ref("One"));
    app.unmount();
    expect(container.querySelector(".cm-editor")).toBeNull();
    app = createApp({ render: () => null });
    app.mount(container);
  });
});
