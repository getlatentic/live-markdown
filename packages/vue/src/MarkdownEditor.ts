import type { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";
import {
  createMarkdownEditor,
  watchSelection,
  type EditorSelectionSnapshot,
  type MarkdownEditor as CoreEditor,
  type MarkdownEditorMode,
  type MarkdownEditorSettings,
} from "@latentic/live-markdown-core";
import {
  defineComponent,
  h,
  markRaw,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
  type Component,
  type PropType,
} from "vue";

import type { MarkdownExtension } from "./extensions";

type Settings = MarkdownEditorSettings<Component>;

/** What a template ref on the component gives. */
export interface MarkdownEditorExposed {
  /** Emit a pending edit now. Call it before saving. */
  flush(): void;
  /** The whole markdown file as the editor holds it now. */
  getValue(): string;
  /** The CodeMirror view, `null` until mounted. */
  view(): EditorView | null;
}

/**
 * `<MarkdownEditor v-model="text" />`. The model is the whole markdown file.
 * It updates 500 ms after the last edit; `flush()` on the template ref
 * updates it at once.
 *
 * Slots: `toolbar` gets `{ view, contributions }`; `selection` gets
 * `{ selection, dismiss }` and renders the actions for selected text.
 *
 * The editor needs a page, so on a server the component renders its empty
 * container and mounts in the browser.
 */
export const MarkdownEditor = defineComponent({
  name: "MarkdownEditor",
  props: {
    modelValue: { type: String, required: true },
    /** Names the document. Each path keeps its own caret, scroll and undo. */
    filePath: String,
    mode: { type: String as PropType<MarkdownEditorMode>, default: "wysiwyg" },
    workspaceRoot: String,
    linkTargets: Object as PropType<ReadonlySet<string>>,
    extensions: Array as PropType<readonly MarkdownExtension[]>,
    resolveImageSrc: Function as PropType<Settings["resolveImageSrc"]>,
    saveImageBytes: Function as PropType<Settings["saveImageBytes"]>,
    renderClipboardHtml: Function as PropType<Settings["renderClipboardHtml"]>,
    // Declared as props so the editor can tell whether the host listens: with
    // no listener its own default applies (a link opens in a new tab). In a
    // template they are still written as events: `@open-external-url`.
    onNavigateToLink: Function as PropType<Settings["onNavigateToLink"]>,
    onOpenExternalUrl: Function as PropType<Settings["onOpenExternalUrl"]>,
    onCommentOnExcerpt: Function as PropType<Settings["onCommentOnExcerpt"]>,
    onAfterContentSwap: Function as PropType<Settings["onAfterContentSwap"]>,
  },
  emits: {
    "update:modelValue": (value: string) => typeof value === "string",
  },
  setup(props, { emit, slots, expose }) {
    const host = ref<HTMLElement>();
    const view = shallowRef<EditorView | null>(null);
    const selection = shallowRef<EditorSelectionSnapshot | null>(null);
    let editor: CoreEditor<Component> | null = null;
    let stopWatchingSelection: (() => void) | null = null;

    const settings = (): Settings => ({
      onChange: (value) => emit("update:modelValue", value),
      mode: props.mode,
      workspaceRoot: props.workspaceRoot,
      linkTargets: props.linkTargets,
      extensions: props.extensions,
      resolveImageSrc: props.resolveImageSrc,
      saveImageBytes: props.saveImageBytes,
      renderClipboardHtml: props.renderClipboardHtml,
      onNavigateToLink: props.onNavigateToLink,
      onOpenExternalUrl: props.onOpenExternalUrl,
      onCommentOnExcerpt: props.onCommentOnExcerpt,
      onAfterContentSwap: props.onAfterContentSwap,
    });

    onMounted(() => {
      editor = createMarkdownEditor<Component>(host.value!, {
        value: props.modelValue,
        filePath: props.filePath,
        ...settings(),
      });
      // Raw: a reactive proxy around CodeMirror's view breaks its identity checks.
      view.value = markRaw(editor.view);
      stopWatchingSelection = watchSelection(editor.view, (next) => (selection.value = next));
    });

    // Sync, so the settings are in place before the document watcher below
    // builds a state from them.
    watch(settings, (next) => editor?.setOptions(next), { flush: "sync" });
    watch(
      () => [props.modelValue, props.filePath] as const,
      ([value, filePath]) => editor?.setDocument(value, filePath),
    );
    watch(
      () => props.mode,
      (mode) => editor?.setMode(mode),
    );

    onBeforeUnmount(() => {
      stopWatchingSelection?.();
      editor?.destroy();
      editor = null;
      view.value = null;
    });

    const dismiss = () => {
      const live = editor?.view;
      if (live) live.dispatch({ selection: EditorSelection.cursor(live.state.selection.main.head) });
    };

    expose({
      flush: () => editor?.flush(),
      getValue: () => editor?.getValue() ?? props.modelValue,
      view: () => editor?.view ?? null,
    } satisfies MarkdownEditorExposed);

    return () =>
      h("div", { class: "cm-editor-host" }, [
        view.value && slots.toolbar
          ? slots.toolbar({ view: view.value, contributions: editor?.toolbar ?? [] })
          : null,
        h("div", { class: "cm-editor-host__scroll", ref: host }),
        slots.selection?.({ selection: selection.value, dismiss }),
      ]);
  },
});
