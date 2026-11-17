/**
 * The extension types as a React host writes them: a toolbar item's icon is
 * a React node. The core's types leave the icon to the host.
 */
import type {
  MarkdownExtension as CoreMarkdownExtension,
  ToolbarContribution as CoreToolbarContribution,
} from "@latentic/live-markdown-core/codemirror/extensions/types";
import type { ReactNode } from "react";

export type { CaretContextSnapshot } from "@latentic/live-markdown-core/codemirror/extensions/types";
export type ToolbarContribution = CoreToolbarContribution<ReactNode>;
export type MarkdownExtension = CoreMarkdownExtension<ReactNode>;
