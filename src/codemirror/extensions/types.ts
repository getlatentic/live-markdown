import { type Extension } from "@codemirror/state";
import { type KeyBinding } from "@codemirror/view";
import { type MarkdownConfig } from "@lezer/markdown";
import { type ReactNode } from "react";

import { type NodeRules } from "../core";
import { type LineKeyRule, type LineKindReader } from "../lineKeys/hostRules";

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
  /** Syntax the module adds to the markdown grammar. The nodes it makes are
   *  painted by `rules`. */
  readonly grammar?: MarkdownConfig[];
  readonly extensions?: Extension[];
  /** Keys of the module's own. They run ahead of CodeMirror's stock keys and
   *  the editor's, except Enter, Tab and Shift-Tab, which the line-key table
   *  decides: change those with `lineKeys`. */
  readonly keymap?: KeyBinding[];
  /** Kinds of line the module names, for its `lineKeys` rules. */
  readonly lineKinds?: LineKindReader[];
  /** Rules for Backspace, Delete, Enter, Tab, Shift-Tab and typed markers,
   *  asked before the editor's table. */
  readonly lineKeys?: LineKeyRule[];
  readonly toolbar?: ToolbarContribution[];
}
