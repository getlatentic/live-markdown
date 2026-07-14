import { type Extension } from "@codemirror/state";
import { type KeyBinding } from "@codemirror/view";
import { type ReactNode } from "react";

import { type NodeRules } from "../decorations/paint";

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

  /** Node rules for constructs this extension's grammar introduces (or
   *  deliberately overrides) — merged into the decoration painter via
   *  `nodeRulesFacet`, so an extension never edits the base table. */
  readonly rules?: NodeRules;
  readonly extensions?: Extension[];
  readonly keymap?: KeyBinding[];
  readonly toolbar?: ToolbarContribution[];
}
