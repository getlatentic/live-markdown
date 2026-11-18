/**
 * @latentic/live-markdown — the editor as a React component.
 *
 * Everything else is `@latentic/live-markdown-core`, exported again here so a
 * React host has one package to import from. `value` in / `onChange` out is
 * always a markdown string — no AST translation, no format lock-in.
 */

export * from "@latentic/live-markdown-core";

export {
  CodeMirrorMarkdownEditor,
  type CodeMirrorMarkdownEditorProps,
  type CodeMirrorEditorMode,
  type EditorSelectionSnapshot,
} from "./codemirror/CodeMirrorMarkdownEditor";

export {
  useMarkdownEditor,
  useEditorSelection,
  useCaretContext,
  type UseMarkdownEditor,
  type UseMarkdownEditorOptions,
} from "./hooks";

// With a React node for a toolbar item's icon.
export { type MarkdownExtension, type ToolbarContribution, type ComposedExtension } from "./codemirror/extensions";
