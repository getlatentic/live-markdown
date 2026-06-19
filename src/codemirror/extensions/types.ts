import { type Extension } from "@codemirror/state";
import { type KeyBinding } from "@codemirror/view";
import { type ReactNode } from "react";

import { type RegistryEntry } from "../decorations/registry";

export interface ToolbarContribution {
  readonly id: string;
  readonly group: "heading" | "format" | "block" | "insert" | string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly shortcut?: string;
  readonly isActive?: (caretContext: CaretContextSnapshot) => boolean;
  readonly run: (view: import("@codemirror/view").EditorView) => void;
}

export interface CaretContextSnapshot {
  readonly bold: boolean;
  readonly italic: boolean;
  readonly code: boolean;
  readonly link: boolean;
  readonly heading: 1 | 2 | 3 | 4 | 5 | 6 | 0;
  readonly bulletList: boolean;
  readonly orderedList: boolean;
  readonly blockquote: boolean;
}

export interface MarkdownExtension {
  readonly name: string;
  readonly version: string;
  readonly description?: string;

  readonly registry?: Record<string, RegistryEntry>;
  readonly extensions?: Extension[];
  readonly keymap?: KeyBinding[];
  readonly toolbar?: ToolbarContribution[];
}
