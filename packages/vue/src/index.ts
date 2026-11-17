/**
 * @latentic/live-markdown-vue — the live-markdown editor as a Vue 3 component.
 * Everything the core exports is exported here too, so one import serves.
 */
export * from "@latentic/live-markdown-core";
export { MarkdownEditor, type MarkdownEditorExposed } from "./MarkdownEditor";
export type { MarkdownExtension, ToolbarContribution } from "./extensions";
