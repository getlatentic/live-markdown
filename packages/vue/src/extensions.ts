/** The extension types as a Vue host writes them: a toolbar icon is a component. */
import type {
  MarkdownExtension as CoreMarkdownExtension,
  ToolbarContribution as CoreToolbarContribution,
} from "@latentic/live-markdown-core";
import type { Component } from "vue";

export type ToolbarContribution = CoreToolbarContribution<Component>;
export type MarkdownExtension = CoreMarkdownExtension<Component>;
